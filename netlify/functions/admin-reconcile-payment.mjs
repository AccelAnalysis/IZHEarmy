import { getStore } from '@netlify/blobs';
import Stripe from 'stripe';
import { requireAdmin } from './_shared/admin-auth.mjs';
import { expectedGiveOneObligations, ensureGiveOneObligations, listGiveOneObligations } from './_shared/give-one-service.mjs';
import { validateLineSettlementSums } from './_shared/payment-rules.mjs';
import { applyStripeReconciliation, proposeStripeReconciliation } from './_shared/payment-service.mjs';
import { linkStripeEventOrder } from './_shared/stripe-event-service.mjs';
import { json, methodNotAllowed } from './_shared/http.mjs';

async function pointerState(storeName, key, sessionId) {
  if (!key) return { applicable: false, present: true, correct: true };
  const value = await getStore(storeName).get(key, { type: 'json', consistency: 'strong' });
  return { applicable: true, present: Boolean(value), correct: value?.sessionId === sessionId, actualSessionId: value?.sessionId || '' };
}

async function giveOneState(order, lineSettlements) {
  const expected = expectedGiveOneObligations({ sessionId: order.sessionId, items: order.items || [], lineSettlements });
  const all = await listGiveOneObligations();
  const stored = all.filter((item) => item.sourceCheckoutSessionId === order.sessionId);
  const storedIds = new Set(stored.map((item) => item.obligationId));
  const missing = expected.filter((item) => !storedIds.has(item.obligationId)).map((item) => item.obligationId);
  const mappingMissing = [];
  for (const obligation of stored) {
    if (!obligation.publicClaimCode) { mappingMissing.push(obligation.obligationId); continue; }
    const code = await getStore('izhe-give-codes').get(obligation.publicClaimCode, { type: 'json', consistency: 'strong' });
    if (!code || code.obligationId !== obligation.obligationId) mappingMissing.push(obligation.obligationId);
  }
  return { expectedCount: expected.length, storedCount: stored.length, missing, mappingMissing, reconciled: missing.length === 0 && mappingMissing.length === 0 && stored.length === expected.length };
}

async function stripeEventState(order, proposal) {
  const store = getStore('izhe-stripe-events');
  const { blobs } = await store.list();
  const expectedIds = new Set(order.stripeEventIds || []);
  const chargeIds = new Set(proposal.payment.chargeIds || []);
  const paymentIntentId = proposal.payment.paymentIntentId || '';
  const sessionId = order.sessionId;
  const receipts = [];
  for (const blob of blobs.slice(-10000)) {
    const value = await store.get(blob.key, { type: 'json', consistency: 'strong' });
    if (!value) continue;
    const matches = expectedIds.has(value.stripeEventId)
      || value.checkoutSessionId === sessionId
      || value.orderId === sessionId
      || (paymentIntentId && value.paymentIntentId === paymentIntentId)
      || (value.chargeId && chargeIds.has(value.chargeId));
    if (matches) receipts.push(value);
  }
  const failed = receipts.filter((item) => ['failed_retryable', 'reconciliation_required'].includes(item.processingState));
  const missingOrderLink = receipts.filter((item) => item.orderId !== sessionId && ['processed', 'reconciliation_required', 'failed_retryable'].includes(item.processingState));
  const expectedMissing = [...expectedIds].filter((eventId) => !receipts.some((item) => item.stripeEventId === eventId));
  return {
    count: receipts.length,
    processedCount: receipts.filter((item) => item.processingState === 'processed').length,
    failedCount: failed.length,
    missingOrderLinkEventIds: missingOrderLink.map((item) => item.stripeEventId),
    expectedMissingEventIds: expectedMissing,
    legacyReceiptUnavailable: receipts.length === 0 && expectedIds.size === 0,
    receipts: receipts.map((item) => ({
      stripeEventId: item.stripeEventId,
      stripeEventType: item.stripeEventType,
      processingState: item.processingState,
      reconciliationState: item.reconciliationState,
      processedTimestamp: item.processedTimestamp,
      orderLinked: item.orderId === sessionId
    }))
  };
}

export default async (request) => {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  const denied = requireAdmin(request);
  if (denied) return denied;
  if (!process.env.STRIPE_SECRET_KEY) return json({ error: 'Stripe reconciliation is not configured.' }, 503);
  try {
    const payload = await request.json();
    const sessionId = String(payload.sessionId || payload.orderReference || '').trim();
    if (!sessionId) return json({ error: 'A stable Checkout Session/order reference is required.' }, 400);
    const order = await getStore('izhe-orders').get(sessionId, { type: 'json', consistency: 'strong' });
    if (!order) return json({ error: 'Order was not found.' }, 404);
    if (payload.apply === true && !payload.expectedUpdatedAt) return json({ error: 'Apply mode requires the order revision timestamp from a fresh dry run.' }, 409);
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const proposal = await proposeStripeReconciliation(stripe, order);
    const paymentIntentId = proposal.payment.paymentIntentId;
    const chargeIds = proposal.payment.chargeIds || [];
    const [paymentIndex, sessionIndex, ...chargeIndexes] = await Promise.all([
      pointerState('izhe-payment-index', paymentIntentId, sessionId),
      pointerState('izhe-checkout-session-index', sessionId, sessionId),
      ...chargeIds.map((chargeId) => pointerState('izhe-charge-index', chargeId, sessionId))
    ]);
    const [giveOne, eventReceipts] = await Promise.all([
      giveOneState(order, proposal.lineSettlements),
      stripeEventState(order, proposal)
    ]);
    const lineSums = validateLineSettlementSums(proposal.lineSettlements);
    const campaignMatches = String(proposal.facts.session?.metadata?.campaignId || '') === String(order.campaignId || '');
    const repairPlan = [];
    if (!paymentIndex.present || !paymentIndex.correct) repairPlan.push('repair_payment_intent_index');
    if (!sessionIndex.present || !sessionIndex.correct) repairPlan.push('repair_checkout_session_index');
    if (chargeIndexes.some((item) => !item.present || !item.correct)) repairPlan.push('repair_charge_indexes');
    if (!giveOne.reconciled) repairPlan.push('repair_give_one_obligations_and_mappings');
    if (eventReceipts.missingOrderLinkEventIds.length) repairPlan.push('repair_stripe_event_order_links');
    if (eventReceipts.failedCount) repairPlan.push('stripe_event_reconciliation_review');
    if (eventReceipts.expectedMissingEventIds.length) repairPlan.push('missing_stripe_event_receipt_history');
    if (proposal.differences.length) repairPlan.push('refresh_canonical_payment_and_line_settlement');
    if (!campaignMatches) repairPlan.push('campaign_attribution_manual_review');
    if (proposal.allocationRequired) repairPlan.push('refund_allocation_required');
    const report = {
      sessionId,
      expectedUpdatedAt: order.updatedAt || '',
      dryRun: payload.apply !== true,
      paymentReconciliationStatus: proposal.payment.reconciliationStatus,
      differences: proposal.differences,
      repairPlan,
      indexes: { paymentIntent: paymentIndex, checkoutSession: sessionIndex, charges: chargeIndexes },
      eventReceipts,
      giveOne,
      campaign: { localCampaignId: order.campaignId || '', stripeCampaignId: proposal.facts.session?.metadata?.campaignId || '', matches: campaignMatches },
      lineSums,
      stripeFacts: {
        currency: proposal.payment.currency,
        totalCharged: proposal.payment.amounts.totalCharged,
        totalRefunded: proposal.payment.amounts.totalRefunded,
        openDisputeAmount: proposal.payment.amounts.openDisputeAmount,
        lostDisputeAmount: proposal.payment.amounts.lostDisputeAmount,
        processorFee: proposal.payment.amounts.processorFee,
        verifiedNetDeposit: proposal.payment.amounts.verifiedNetDeposit,
        refundIds: proposal.payment.refundReferences.map((item) => item.id),
        disputeIds: proposal.payment.disputeReferences.map((item) => item.id)
      }
    };
    if (payload.apply !== true) return json({ report });
    if (!campaignMatches) return json({ error: 'Campaign attribution differs from the immutable Stripe Checkout metadata. Manual review is required before applying a repair.', report }, 409);
    const saved = await applyStripeReconciliation(order, proposal, { expectedUpdatedAt: payload.expectedUpdatedAt, source: 'admin-token', reason: 'manual_reconcile_with_stripe' });
    const obligations = await ensureGiveOneObligations({
      sessionId,
      paymentIntentId: saved.payment?.paymentIntentId || saved.paymentIntentId || '',
      orderId: sessionId,
      items: saved.items || [],
      lineSettlements: saved.lineSettlements || [],
      campaignId: saved.campaignId || '',
      campaignSlug: saved.campaignSlug || '',
      campaign: saved.campaign || null,
      purchaserEmail: saved.customerEmail || '',
      legacyCodes: saved.giveCodes || [],
      entitlementPolicyVersion: 'give-one-v1'
    });
    for (const eventId of eventReceipts.missingOrderLinkEventIds) await linkStripeEventOrder(eventId, sessionId);
    return json({ report: { ...report, dryRun: false, applied: true, giveOneObligationCount: obligations.length, repairedStripeEventLinks: eventReceipts.missingOrderLinkEventIds.length }, order: saved });
  } catch (error) {
    console.error('admin-reconcile-payment', String(error?.message || error).slice(0, 500));
    return json({ error: error.message || 'Payment reconciliation failed.' }, error.statusCode || 400);
  }
};
