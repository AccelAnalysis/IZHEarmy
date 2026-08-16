import { getStore } from '@netlify/blobs';
import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import { normalizeLegacyPayment } from './_shared/payment-rules.mjs';
import { json } from './_shared/http.mjs';

async function listRaw(storeName, limit = 10000) {
  const store = getStore(storeName);
  const { blobs } = await store.list();
  const rows = [];
  for (const blob of blobs.slice(-limit).reverse()) {
    const value = await store.get(blob.key, { type: 'json', consistency: 'strong' });
    rows.push({ key: blob.key, value });
  }
  return rows;
}

function classify(order) {
  if (order?.payment?.checkoutSessionId || order?.payment?.paymentIntentId) {
    if (order.payment.reconciliationStatus === 'reconciled') return 'legacy_reconciled';
    return order.payment.reconciliationStatus || 'manual_review_required';
  }
  const payment = normalizeLegacyPayment(order);
  if (['refunded_or_disputed', 'refund_requires_review'].includes(order?.status)) return 'manual_review_required';
  if (payment.checkoutSessionId && payment.paymentIntentId) return 'stripe_backfill_available';
  if (payment.checkoutSessionId || payment.paymentIntentId) return 'stripe_backfill_available';
  return 'stripe_reference_missing';
}

async function indexExists(storeName, key, sessionId) {
  if (!key) return false;
  const value = await getStore(storeName).get(key, { type: 'json', consistency: 'strong' });
  return value?.sessionId === sessionId;
}

export default adminEndpoint({
  methods: ['GET'],
  permission: 'accountability.read',
  csrf: false,
  recentAuth: false,
  auditAction: 'payment_migration.read',
  rateClass: 'read'
}, async () => {
  const rawOrders = await listRaw('izhe-orders');
  const orderRows = rawOrders.filter(({ key, value }) => !key.startsWith('lock-') && value);
  const oldLocks = rawOrders.filter(({ key }) => key.startsWith('lock-'));
  const report = [];
  const counts = {};
  let missingPaymentIndexes = 0;
  let missingSessionIndexes = 0;
  let staleLegacyLocks = 0;
  for (const { key, value: order } of orderRows) {
    const sessionId = order.sessionId || key;
    const payment = order.payment || normalizeLegacyPayment(order);
    const classification = classify(order);
    counts[classification] = (counts[classification] || 0) + 1;
    const paymentIndexPresent = payment.paymentIntentId ? await indexExists('izhe-payment-index', payment.paymentIntentId, sessionId) : false;
    const sessionIndexPresent = sessionId ? await indexExists('izhe-checkout-session-index', sessionId, sessionId) : false;
    if (payment.paymentIntentId && !paymentIndexPresent) missingPaymentIndexes += 1;
    if (sessionId && !sessionIndexPresent) missingSessionIndexes += 1;
    report.push({
      sessionId,
      classification,
      canonicalPaymentPresent: Boolean(order.payment),
      checkoutSessionReferencePresent: Boolean(payment.checkoutSessionId || sessionId),
      paymentIntentReferencePresent: Boolean(payment.paymentIntentId),
      paymentIndexPresent,
      sessionIndexPresent,
      legacyGiveCodeCount: Array.isArray(order.giveCodes) ? order.giveCodes.length : 0,
      canonicalLineSettlementPresent: Array.isArray(order.lineSettlements) && order.lineSettlements.length > 0,
      supportPolicySnapshotPresent: Boolean(order.supportPolicy),
      recommendedAction: classification === 'stripe_reference_missing'
        ? 'manual_review_required'
        : classification === 'legacy_reconciled'
          ? (!paymentIndexPresent || !sessionIndexPresent ? 'local_index_repair' : 'none')
          : 'reconcile_with_stripe'
    });
  }
  const now = Date.now();
  const lockRows = oldLocks.map(({ key, value }) => {
    const created = new Date(value?.createdAt || 0).valueOf();
    const stale = !Number.isFinite(created) || now - created > 5 * 60_000;
    if (stale) staleLegacyLocks += 1;
    return { key, createdAt: value?.createdAt || '', stale, note: 'Legacy one-shot lock. This dry-run report does not delete it.' };
  });
  const payload = {
    dryRun: true,
    generatedAt: new Date().toISOString(),
    counts: {
      totalOrders: report.length,
      ...counts,
      missingPaymentIndexes,
      missingSessionIndexes,
      legacyLockCount: lockRows.length,
      staleLegacyLockCount: staleLegacyLocks
    },
    orders: report,
    legacyLocks: lockRows,
    mutationPerformed: false,
    note: 'This endpoint is inspection-only. It does not rewrite orders, issue claim codes, delete locks, mutate Stripe, or run a production-wide migration.'
  };
  return {
    response: json(payload),
    audit: {
      resourceType: 'payment_migration_report',
      resourceId: null,
      result: 'success',
      afterSummary: payload.counts
    }
  };
});
