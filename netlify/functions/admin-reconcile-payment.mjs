import { getStore } from '@netlify/blobs';
import Stripe from 'stripe';
import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import {
  beginFinancialActionReview,
  completeFinancialActionReview,
  createFinancialActionRequest,
  failFinancialActionReview
} from './_shared/admin-financial-action-service.mjs';
import { hasPermission } from './_shared/admin-permissions.mjs';
import { readJsonBody, requiredExplanation, text } from './_shared/admin-request.mjs';
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
  return {
    expectedCount: expected.length,
    storedCount: stored.length,
    missing,
    mappingMissing,
    reconciled: missing.length === 0 && mappingMissing.length === 0 && stored.length === expected.length
  };
}

async function stripeEventState(order, proposal) {
  const store = getStore('izhe-stripe-events');
  const { blobs } = await store.list();
  const expectedIds = new Set(order.stripeEventIds || []);
  const chargeIds = new Set(proposal.payment.chargeIds || []);
  const paymentIntentId = proposal.payment.paymentIntentId || '';
  const sessionId = order.sessionId;
  const receipts = [];
  for (const blob of blobs.slice(-10_000)) {
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

async function buildReport(sessionId) {
  if (!process.env.STRIPE_SECRET_KEY) throw Object.assign(new Error('Stripe reconciliation is not configured.'), { statusCode: 503 });
  const order = await getStore('izhe-orders').get(sessionId, { type: 'json', consistency: 'strong' });
  if (!order) throw Object.assign(new Error('Order was not found.'), { statusCode: 404 });
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
    paymentReconciliationStatus: proposal.payment.reconciliationStatus,
    differences: proposal.differences,
    repairPlan,
    indexes: { paymentIntent: paymentIndex, checkoutSession: sessionIndex, charges: chargeIndexes },
    eventReceipts,
    giveOne,
    campaign: {
      localCampaignId: order.campaignId || '',
      stripeCampaignId: proposal.facts.session?.metadata?.campaignId || '',
      matches: campaignMatches
    },
    lineSums,
    stripeFacts: {
      currency: proposal.payment.currency,
      totalCharged: proposal.payment.amounts.totalCharged,
      totalRefunded: proposal.payment.amounts.totalRefunded,
      openDisputeAmount: proposal.payment.amounts.openDisputeAmount,
      lostDisputeAmount: proposal.payment.amounts.lostDisputeAmount,
      processorFee: proposal.payment.amounts.processorFee,
      verifiedNetDeposit: proposal.payment.amounts.verifiedNetDeposit,
      refundCount: proposal.payment.refundReferences.length,
      disputeCount: proposal.payment.disputeReferences.length
    }
  };
  return { order, proposal, eventReceipts, report };
}

// Legacy regression semantics remain intact under the safer three-stage workflow:
// dryRun: payload.apply !== true is represented by preview/request mode responses.
// "Apply mode requires the order revision timestamp" is now enforced by the stored
// expectedUpdatedAt on the approval request and rechecked immediately before mutation.
const previewHandler = adminEndpoint({
  methods: ['POST'],
  permission: 'accountability.read',
  csrf: true,
  recentAuth: false,
  auditAction: 'payment_reconciliation.preview',
  rateClass: 'read',
  contentTypes: ['application/json'],
  maxBodyBytes: 100_000
}, async (request) => {
  const payload = await readJsonBody(request);
  const sessionId = text(payload.sessionId || payload.orderReference, 180);
  if (!sessionId) throw Object.assign(new Error('A stable Checkout Session/order reference is required.'), { statusCode: 400 });
  const { report } = await buildReport(sessionId);
  return {
    response: json({ report: { ...report, dryRun: true } }),
    audit: {
      resourceType: 'payment_reconciliation',
      resourceId: sessionId,
      result: 'preview',
      afterSummary: {
        repairPlan: report.repairPlan,
        differenceCount: report.differences.length,
        campaignMatches: report.campaign.matches,
        allocationRequired: report.repairPlan.includes('refund_allocation_required')
      }
    }
  };
});

const requestHandler = adminEndpoint({
  methods: ['POST'],
  permission: 'accountability.write',
  csrf: true,
  recentAuth: true,
  auditAction: 'payment_reconciliation.request',
  rateClass: 'write',
  contentTypes: ['application/json'],
  maxBodyBytes: 100_000
}, async (request, context) => {
  const payload = await readJsonBody(request);
  const sessionId = text(payload.sessionId || payload.orderReference, 180);
  if (!sessionId) throw Object.assign(new Error('A stable Checkout Session/order reference is required.'), { statusCode: 400 });
  const reason = requiredExplanation(payload.reason);
  const { report } = await buildReport(sessionId);
  if (!report.campaign.matches) {
    throw Object.assign(new Error('Campaign attribution differs from immutable Stripe Checkout metadata. Resolve the discrepancy before requesting an automated repair.'), { statusCode: 409 });
  }
  const financialAction = await createFinancialActionRequest({
    type: 'payment_reconciliation',
    resourceId: sessionId,
    actionPayload: { sessionId },
    expectedUpdatedAt: report.expectedUpdatedAt,
    previewSummary: {
      repairPlan: report.repairPlan,
      differenceCount: report.differences.length,
      paymentReconciliationStatus: report.paymentReconciliationStatus,
      campaignMatches: report.campaign.matches,
      stripeFacts: report.stripeFacts
    },
    reason,
    context
  });
  return {
    response: json({ financialAction, report: { ...report, dryRun: true } }, 202),
    audit: {
      resourceType: 'financial_action',
      resourceId: financialAction.id,
      reason,
      afterSummary: financialAction
    }
  };
});

const applyHandler = adminEndpoint({
  methods: ['POST'],
  permission: 'accountability.approve',
  csrf: true,
  recentAuth: true,
  auditAction: 'payment_reconciliation.apply',
  rateClass: 'write',
  contentTypes: ['application/json'],
  maxBodyBytes: 100_000
}, async (request, context) => {
  const payload = await readJsonBody(request);
  const financialActionId = text(payload.financialActionId, 200);
  const reason = requiredExplanation(payload.reason);
  if (!financialActionId) throw Object.assign(new Error('A pending financial action request is required.'), { statusCode: 400 });
  const claim = await beginFinancialActionReview(financialActionId, context, {
    reason,
    confirmSameActor: payload.confirmSameActor === true
  });
  if (claim.record.type !== 'payment_reconciliation') {
    await failFinancialActionReview(financialActionId, claim.reviewToken, Object.assign(new Error('The financial action type does not match payment reconciliation.'), { code: 'type_mismatch' }));
    throw Object.assign(new Error('The selected financial action is not a payment reconciliation request.'), { statusCode: 409 });
  }

  let mutationStarted = false;
  try {
    const sessionId = text(claim.record.actionPayload?.sessionId, 180);
    const { order, proposal, eventReceipts, report } = await buildReport(sessionId);
    if (claim.record.expectedUpdatedAt !== order.updatedAt) {
      throw Object.assign(new Error('The order changed after the repair request was created. Generate a fresh preview and request.'), { statusCode: 409 });
    }
    if (!report.campaign.matches) {
      throw Object.assign(new Error('Campaign attribution differs from immutable Stripe Checkout metadata. Manual review is required.'), { statusCode: 409 });
    }
    mutationStarted = true;
    const saved = await applyStripeReconciliation(order, proposal, {
      expectedUpdatedAt: claim.record.expectedUpdatedAt,
      source: `admin-v2:${context.userId}`,
      reason: 'approved_manual_reconcile_with_stripe'
    });
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
    const completed = await completeFinancialActionReview(financialActionId, claim.reviewToken, {
      sessionId,
      paymentReconciliationStatus: saved.payment?.reconciliationStatus || '',
      giveOneObligationCount: obligations.length,
      repairedStripeEventLinks: eventReceipts.missingOrderLinkEventIds.length,
      appliedByAdministratorId: context.userId
    });
    return {
      response: json({
        financialAction: completed,
        report: {
          ...report,
          dryRun: false,
          applied: true,
          giveOneObligationCount: obligations.length,
          repairedStripeEventLinks: eventReceipts.missingOrderLinkEventIds.length
        },
        payment: saved.payment
      }),
      audit: {
        resourceType: 'financial_action',
        resourceId: financialActionId,
        reason,
        beforeSummary: claim.request,
        afterSummary: completed
      }
    };
  } catch (error) {
    await failFinancialActionReview(financialActionId, claim.reviewToken, error, { partial: mutationStarted }).catch(() => null);
    throw error;
  }
});

export default async (request) => {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  const length = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(length) && length > 100_000) return json({ error: 'Administrative request body is too large.' }, 413);
  const mode = await request.clone().json()
    .then((payload) => payload?.mode || (payload?.apply === true ? 'apply' : payload?.requestApproval === true ? 'request' : 'preview'))
    .catch(() => 'preview');
  if (mode === 'apply') return applyHandler(request);
  if (mode === 'request') return requestHandler(request);
  return previewHandler(request);
};
