import { getStore } from '@netlify/blobs';
import {
  applyDisputeFacts,
  applyRefundFacts,
  allocateRefundToLines,
  buildLineSettlements,
  canonicalPaymentFromCheckout,
  cents,
  normalizeLegacyPayment,
  recomputePaymentAvailability,
  validateLineSettlementSums
} from './payment-rules.mjs';

const ORDER_STORE = 'izhe-orders';
const PAYMENT_INDEX_STORE = 'izhe-payment-index';
const SESSION_INDEX_STORE = 'izhe-checkout-session-index';
const CHARGE_INDEX_STORE = 'izhe-charge-index';
export const RECONCILIATION_TASK_STORE = 'izhe-reconciliation-tasks';
export const RECONCILIATION_HISTORY_STORE = 'izhe-reconciliation-history';

const nowIso = () => new Date().toISOString();
const clean = (value, max = 240) => String(value ?? '').trim().slice(0, max);

async function ensurePointer(storeName, key, sessionId, pointerType) {
  if (!key) return { state: 'not_applicable' };
  const store = getStore(storeName);
  const current = await store.getWithMetadata(key, { type: 'json', consistency: 'strong' });
  if (current?.data) {
    if (current.data.sessionId !== sessionId) {
      throw Object.assign(new Error(`${pointerType} is already linked to a different IZHE order.`), { code: 'payment_index_conflict', reconciliationRequired: true });
    }
    return { state: 'present', value: current.data };
  }
  const value = { sessionId, pointerType, updatedAt: nowIso() };
  const created = await store.setJSON(key, value, { onlyIfNew: true });
  if (created.modified) return { state: 'repaired', value };
  const raced = await store.get(key, { type: 'json', consistency: 'strong' });
  if (raced?.sessionId === sessionId) return { state: 'present', value: raced };
  throw Object.assign(new Error(`${pointerType} changed while it was being repaired.`), { code: 'payment_index_conflict', reconciliationRequired: true });
}

export async function ensurePaymentIndexes(order) {
  const sessionId = clean(order?.sessionId || order?.payment?.checkoutSessionId, 180);
  if (!sessionId) throw Object.assign(new Error('Order is missing its Checkout Session identity.'), { code: 'missing_session_id' });
  const paymentIntentId = clean(order?.payment?.paymentIntentId || order?.paymentIntentId, 180);
  const chargeIds = [...new Set([...(order?.payment?.chargeIds || []), ...(order?.chargeIds || [])].map((id) => clean(id, 180)).filter(Boolean))];
  const session = await ensurePointer(SESSION_INDEX_STORE, sessionId, sessionId, 'checkout_session');
  const payment = await ensurePointer(PAYMENT_INDEX_STORE, paymentIntentId, sessionId, 'payment_intent');
  const charges = [];
  for (const chargeId of chargeIds) charges.push({ chargeId, ...(await ensurePointer(CHARGE_INDEX_STORE, chargeId, sessionId, 'charge')) });
  return { session, payment, charges };
}

async function pointerSession(storeName, key) {
  if (!key) return '';
  const pointer = await getStore(storeName).get(key, { type: 'json', consistency: 'strong' });
  return clean(pointer?.sessionId, 180);
}

async function scanOrdersForReference({ paymentIntentId = '', chargeId = '' } = {}) {
  const store = getStore(ORDER_STORE);
  const { blobs } = await store.list();
  for (const blob of blobs.slice(-10000).reverse()) {
    if (blob.key.startsWith('lock-')) continue;
    const order = await store.get(blob.key, { type: 'json', consistency: 'strong' });
    if (!order) continue;
    const payment = order.payment || normalizeLegacyPayment(order);
    if (paymentIntentId && payment.paymentIntentId === paymentIntentId) return { sessionId: order.sessionId || blob.key, order, foundVia: 'order_scan_payment_intent' };
    if (chargeId && (payment.chargeIds || []).includes(chargeId)) return { sessionId: order.sessionId || blob.key, order, foundVia: 'order_scan_charge' };
  }
  return null;
}

export async function findOrderForStripeReferences({ sessionId = '', paymentIntentId = '', chargeId = '' } = {}, { repairIndexes = true } = {}) {
  const orders = getStore(ORDER_STORE);
  let resolvedSessionId = clean(sessionId, 180);
  let foundVia = resolvedSessionId ? 'checkout_session' : '';
  if (!resolvedSessionId && paymentIntentId) {
    resolvedSessionId = await pointerSession(PAYMENT_INDEX_STORE, paymentIntentId);
    if (resolvedSessionId) foundVia = 'payment_intent_index';
  }
  if (!resolvedSessionId && chargeId) {
    resolvedSessionId = await pointerSession(CHARGE_INDEX_STORE, chargeId);
    if (resolvedSessionId) foundVia = 'charge_index';
  }
  let order = resolvedSessionId ? await orders.get(resolvedSessionId, { type: 'json', consistency: 'strong' }) : null;
  if (!order && (paymentIntentId || chargeId)) {
    const scanned = await scanOrdersForReference({ paymentIntentId, chargeId });
    if (scanned) ({ sessionId: resolvedSessionId, order, foundVia } = scanned);
  }
  if (!order) return null;
  const repair = repairIndexes ? await ensurePaymentIndexes(order) : null;
  return { sessionId: resolvedSessionId, order, foundVia, repair };
}

export async function createReconciliationTask({ type, sessionId = '', campaignId = '', sourceId = '', message = '', severity = 'warning', details = {} } = {}) {
  const safeType = clean(type || 'manual_review_required', 100).replace(/[^a-zA-Z0-9_-]+/g, '-');
  const id = `${safeType}:${clean(sessionId || 'unmatched', 180)}:${clean(sourceId || 'none', 180)}`;
  const store = getStore(RECONCILIATION_TASK_STORE);
  const existing = await store.getWithMetadata(id, { type: 'json', consistency: 'strong' });
  const at = nowIso();
  const value = {
    ...(existing?.data || {}),
    id,
    type: safeType,
    sessionId: clean(sessionId, 180),
    campaignId: clean(campaignId, 100),
    sourceId: clean(sourceId, 180),
    severity: ['info', 'warning', 'critical'].includes(severity) ? severity : 'warning',
    state: 'open',
    message: clean(message, 800),
    details,
    createdAt: existing?.data?.createdAt || at,
    updatedAt: at
  };
  const result = existing
    ? await store.setJSON(id, value, { onlyIfMatch: existing.etag })
    : await store.setJSON(id, value, { onlyIfNew: true });
  return result.modified ? value : (await store.get(id, { type: 'json', consistency: 'strong' })) || value;
}

export async function resolveReconciliationTask(id, note = '') {
  const store = getStore(RECONCILIATION_TASK_STORE);
  const current = await store.getWithMetadata(id, { type: 'json', consistency: 'strong' });
  if (!current?.data) return null;
  const next = { ...current.data, state: 'resolved', resolutionNote: clean(note, 1000), resolvedAt: nowIso(), updatedAt: nowIso() };
  const result = await store.setJSON(id, next, { onlyIfMatch: current.etag });
  return result.modified ? next : null;
}

export async function listReconciliationTasks(limit = 5000) {
  const store = getStore(RECONCILIATION_TASK_STORE);
  const { blobs } = await store.list();
  const results = [];
  for (const blob of blobs.slice(-limit).reverse()) {
    const value = await store.get(blob.key, { type: 'json', consistency: 'strong' });
    if (value) results.push(value);
  }
  return results.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
}

export async function retrieveStripePaymentFacts(stripe, { sessionId, paymentIntentId = '' } = {}) {
  let session = null;
  if (sessionId) session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent.latest_charge.balance_transaction'] });
  const resolvedPaymentIntentId = clean(paymentIntentId || (typeof session?.payment_intent === 'string' ? session.payment_intent : session?.payment_intent?.id), 180);
  const [lineItemsResult, paymentIntent, chargesResult, refundsResult, disputesResult] = await Promise.all([
    sessionId ? stripe.checkout.sessions.listLineItems(sessionId, { limit: 100 }) : Promise.resolve({ data: [] }),
    resolvedPaymentIntentId ? stripe.paymentIntents.retrieve(resolvedPaymentIntentId, { expand: ['latest_charge.balance_transaction'] }) : Promise.resolve(null),
    resolvedPaymentIntentId ? stripe.charges.list({ payment_intent: resolvedPaymentIntentId, limit: 100, expand: ['data.balance_transaction'] }) : Promise.resolve({ data: [] }),
    resolvedPaymentIntentId ? stripe.refunds.list({ payment_intent: resolvedPaymentIntentId, limit: 100 }) : Promise.resolve({ data: [] }),
    resolvedPaymentIntentId ? stripe.disputes.list({ payment_intent: resolvedPaymentIntentId, limit: 100 }) : Promise.resolve({ data: [] })
  ]);
  if (!session && sessionId) throw Object.assign(new Error('Stripe Checkout Session could not be retrieved.'), { code: 'stripe_session_missing' });
  const charges = chargesResult?.data || [];
  const refunds = refundsResult?.data || [];
  const disputes = disputesResult?.data || [];
  const succeededRefunds = refunds.filter((refund) => !refund.status || refund.status === 'succeeded');
  const totalRefunded = succeededRefunds.reduce((sum, refund) => sum + Math.max(0, cents(refund.amount)), 0);
  const refundReferences = refunds.map((refund) => ({ id: refund.id, amount: cents(refund.amount), status: refund.status || '', createdAt: refund.created ? new Date(refund.created * 1000).toISOString() : '' }));
  const disputeReferences = disputes.map((dispute) => ({ id: dispute.id, amount: cents(dispute.amount), status: dispute.status || '', createdAt: dispute.created ? new Date(dispute.created * 1000).toISOString() : '' }));
  const openDisputeAmount = disputes.filter((dispute) => !['won', 'lost', 'warning_closed'].includes(dispute.status)).reduce((sum, dispute) => sum + Math.max(0, cents(dispute.amount)), 0);
  const lostDisputeAmount = disputes.filter((dispute) => dispute.status === 'lost').reduce((sum, dispute) => sum + Math.max(0, cents(dispute.amount)), 0);
  let processorFee = 0;
  let verifiedNetDeposit = 0;
  let hasBalanceFacts = false;
  for (const charge of charges) {
    const balance = typeof charge.balance_transaction === 'object' ? charge.balance_transaction : null;
    if (balance && Number.isInteger(balance.fee) && Number.isInteger(balance.net)) {
      processorFee += balance.fee;
      verifiedNetDeposit += balance.net;
      hasBalanceFacts = true;
    }
  }
  return {
    session,
    lineItems: lineItemsResult?.data || [],
    paymentIntent,
    charges,
    refunds,
    disputes,
    chargeIds: charges.map((charge) => charge.id),
    totalRefunded,
    refundReferences,
    disputeReferences,
    openDisputeAmount,
    lostDisputeAmount,
    processorFee: hasBalanceFacts ? processorFee : null,
    verifiedNetDeposit: hasBalanceFacts ? verifiedNetDeposit : null
  };
}

function activeAllocationEntries(order) {
  const history = Array.isArray(order?.refundAllocationHistory) ? order.refundAllocationHistory : [];
  const reversed = new Set(history.filter((entry) => entry.kind === 'reversal' && entry.reversalOf).map((entry) => entry.reversalOf));
  return history.filter((entry) => entry.kind === 'allocation' && !reversed.has(entry.id));
}

function aggregateRefundAllocations(order) {
  const active = activeAllocationEntries(order);
  const lineMap = new Map();
  let shippingRefunded = 0;
  let taxRefunded = 0;
  for (const entry of active) {
    shippingRefunded += Math.max(0, cents(entry.shippingAmount));
    taxRefunded += Math.max(0, cents(entry.taxAmount));
    for (const line of entry.lineAllocations || []) {
      const current = lineMap.get(line.lineId) || { lineId: line.lineId, amount: 0, wholeUnitIndexes: [] };
      current.amount += Math.max(0, cents(line.amount));
      current.wholeUnitIndexes.push(...(line.wholeUnitIndexes || []));
      current.wholeUnitIndexes = [...new Set(current.wholeUnitIndexes)];
      lineMap.set(line.lineId, current);
    }
  }
  return { lineAllocations: [...lineMap.values()], shippingRefunded, taxRefunded };
}

function fullRefundAllocation(lines, payment) {
  return {
    lineAllocations: (lines || []).map((line) => ({
      lineId: line.lineId,
      amount: Math.max(0, cents(line.netMerchandiseBeforeRefunds)),
      wholeUnitIndexes: Array.from({ length: Math.max(0, cents(line.quantityPurchased)) }, (_, index) => index)
    })),
    shippingRefunded: Math.max(0, cents(payment.amounts?.shippingCollected)),
    taxRefunded: Math.max(0, cents(payment.amounts?.taxCollected))
  };
}

function comparePayment(local, proposed) {
  const differences = [];
  const fields = [
    'merchandiseGross', 'discountTotal', 'merchandiseNetBeforeRefunds', 'shippingCollected', 'taxCollected', 'totalCharged',
    'merchandiseRefunded', 'shippingRefunded', 'taxRefunded', 'refundUnallocated', 'totalRefunded', 'openDisputeAmount',
    'lostDisputeAmount', 'netCollected', 'amountHeld', 'availableAfterHolds'
  ];
  for (const field of fields) {
    const before = cents(local?.amounts?.[field], null);
    const after = cents(proposed?.amounts?.[field], null);
    if (before !== after) differences.push({ field: `payment.amounts.${field}`, before, after });
  }
  for (const field of ['captureStatus', 'refundStatus', 'disputeStatus', 'reconciliationStatus']) {
    if ((local?.[field] || '') !== (proposed?.[field] || '')) differences.push({ field: `payment.${field}`, before: local?.[field] || '', after: proposed?.[field] || '' });
  }
  return differences;
}

export async function proposeStripeReconciliation(stripe, order) {
  const legacyPayment = order.payment || normalizeLegacyPayment(order);
  const sessionId = order.sessionId || legacyPayment.checkoutSessionId;
  const facts = await retrieveStripePaymentFacts(stripe, { sessionId, paymentIntentId: legacyPayment.paymentIntentId || order.paymentIntentId });
  const discountTotal = Math.max(0, cents(facts.session?.total_details?.amount_discount));
  let lines = Array.isArray(order.lineSettlements) && order.lineSettlements.length
    ? structuredClone(order.lineSettlements)
    : buildLineSettlements({ sessionId, draftItems: order.items || [], stripeLineItems: facts.lineItems, orderDiscountTotal: discountTotal });
  const canonical = canonicalPaymentFromCheckout({ session: facts.session, lines, chargeIds: facts.chargeIds, paidAt: legacyPayment.paidAt || order.createdAt || nowIso(), reconciliationStatus: 'reconciled' });
  canonical.amounts.processorFee = facts.processorFee;
  canonical.amounts.verifiedNetDeposit = facts.verifiedNetDeposit;
  let allocation = aggregateRefundAllocations(order);
  const fullRefund = facts.totalRefunded > 0 && facts.totalRefunded >= canonical.amounts.totalCharged;
  if (fullRefund) allocation = fullRefundAllocation(lines, canonical);
  if (allocation.lineAllocations.length) lines = allocateRefundToLines(lines, allocation.lineAllocations);
  const lineTotals = validateLineSettlementSums(lines);
  const allocatedMerchandise = lineTotals.merchandiseRefunded;
  const allocatedTotal = allocatedMerchandise + allocation.shippingRefunded + allocation.taxRefunded;
  const allocationRequired = facts.totalRefunded > 0 && !fullRefund && allocatedTotal < facts.totalRefunded;
  let payment = applyRefundFacts(canonical, {
    totalRefunded: facts.totalRefunded,
    merchandiseRefunded: allocatedMerchandise,
    shippingRefunded: allocation.shippingRefunded,
    taxRefunded: allocation.taxRefunded,
    refundReferences: facts.refundReferences,
    allocationRequired
  });
  payment.disputeReferences = facts.disputeReferences;
  payment.amounts.openDisputeAmount = facts.openDisputeAmount;
  payment.amounts.lostDisputeAmount = facts.lostDisputeAmount;
  if (facts.openDisputeAmount > 0) payment.disputeStatus = 'open';
  else if (facts.disputes.some((dispute) => dispute.status === 'lost')) payment.disputeStatus = 'lost';
  else if (facts.disputes.some((dispute) => dispute.status === 'won')) payment.disputeStatus = 'won';
  else payment.disputeStatus = 'none';
  payment = recomputePaymentAvailability(payment);
  if (allocationRequired) payment.reconciliationStatus = 'allocation_required';
  const differences = comparePayment(legacyPayment, payment);
  return { payment, lineSettlements: lines, facts, differences, allocationRequired, fullRefund };
}

export async function applyStripeReconciliation(order, proposal, { expectedUpdatedAt = '', source = 'admin-token', reason = 'stripe_reconciliation' } = {}) {
  const store = getStore(ORDER_STORE);
  const sessionId = order.sessionId || proposal.payment.checkoutSessionId;
  const current = await store.getWithMetadata(sessionId, { type: 'json', consistency: 'strong' });
  if (!current?.data) throw Object.assign(new Error('Order no longer exists.'), { statusCode: 404 });
  if (expectedUpdatedAt && current.data.updatedAt !== expectedUpdatedAt) throw Object.assign(new Error('Order changed while reconciliation was being reviewed.'), { statusCode: 409 });
  const at = nowIso();
  const next = {
    ...current.data,
    payment: proposal.payment,
    lineSettlements: proposal.lineSettlements,
    paymentIntentId: proposal.payment.paymentIntentId,
    paymentStatus: proposal.payment.captureStatus === 'paid' ? 'paid' : current.data.paymentStatus,
    amountSubtotal: proposal.payment.amounts.merchandiseGross,
    amountShipping: proposal.payment.amounts.shippingCollected,
    amountTax: proposal.payment.amounts.taxCollected,
    amountDiscount: proposal.payment.amounts.discountTotal,
    amountTotal: proposal.payment.amounts.totalCharged,
    currency: proposal.payment.currency,
    updatedAt: at,
    reconciliationHistory: [...(current.data.reconciliationHistory || []), {
      id: `RECON-${Date.now().toString(36).toUpperCase()}`,
      at,
      source,
      reason,
      differences: proposal.differences,
      reconciliationStatus: proposal.payment.reconciliationStatus
    }].slice(-100)
  };
  const saved = await store.setJSON(sessionId, next, { onlyIfMatch: current.etag });
  if (!saved.modified) throw Object.assign(new Error('Order changed during reconciliation.'), { statusCode: 409 });
  await ensurePaymentIndexes(next);
  const historyStore = getStore(RECONCILIATION_HISTORY_STORE);
  const history = next.reconciliationHistory.at(-1);
  await historyStore.setJSON(`${sessionId}:${history.id}`, { sessionId, ...history }, { onlyIfNew: true }).catch(() => {});
  if (proposal.allocationRequired) {
    await createReconciliationTask({ type: 'refund_allocation_required', sessionId, campaignId: next.campaignId || '', sourceId: proposal.facts.refundReferences.at(-1)?.id || '', severity: 'critical', message: 'A verified Stripe refund requires merchandise/shipping/tax allocation before accountability can be final.' });
  }
  return next;
}

export async function markPaymentEventOnOrder(sessionId, stripeEventId, stripeEventAt = nowIso()) {
  const store = getStore(ORDER_STORE);
  const current = await store.getWithMetadata(sessionId, { type: 'json', consistency: 'strong' });
  if (!current?.data) return null;
  const payment = { ...(current.data.payment || normalizeLegacyPayment(current.data)), lastStripeEventAt: stripeEventAt };
  const next = { ...current.data, payment, stripeEventIds: [...new Set([...(current.data.stripeEventIds || []), stripeEventId].filter(Boolean))].slice(-200), updatedAt: nowIso() };
  const saved = await store.setJSON(sessionId, next, { onlyIfMatch: current.etag });
  return saved.modified ? next : null;
}
