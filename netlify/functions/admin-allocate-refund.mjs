import { getStore } from '@netlify/blobs';
import Stripe from 'stripe';
import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import {
  beginFinancialActionReview,
  completeFinancialActionReview,
  createFinancialActionRequest,
  failFinancialActionReview
} from './_shared/admin-financial-action-service.mjs';
import { readJsonBody, requiredExplanation, text } from './_shared/admin-request.mjs';
import { listGiveOneObligations, transitionGiveOneObligations } from './_shared/give-one-service.mjs';
import { appendRefundAllocation, validateRefundAllocation } from './_shared/refund-allocation-service.mjs';
import { applyStripeReconciliation, proposeStripeReconciliation } from './_shared/payment-service.mjs';
import { json, methodNotAllowed } from './_shared/http.mjs';

function wholeUnitKeys(lines = []) {
  const keys = new Set();
  for (const line of lines) for (const index of line.allocatedWholeUnitReversals || []) keys.add(`${line.lineId}:${index}`);
  return keys;
}

async function loadOrder(sessionId) {
  const order = await getStore('izhe-orders').get(sessionId, { type: 'json', consistency: 'strong' });
  if (!order) throw Object.assign(new Error('Order was not found.'), { statusCode: 404 });
  return order;
}

function previewAllocation(order, input) {
  if (input?.reversalOf) {
    const target = (order.refundAllocationHistory || []).find((entry) => entry.id === String(input.reversalOf) && entry.kind === 'allocation');
    if (!target) throw Object.assign(new Error('The allocation being reversed was not found.'), { statusCode: 400 });
    if (!String(input.note || '').trim()) throw Object.assign(new Error('Allocation reversal requires an administrator note.'), { statusCode: 400 });
    return { kind: 'reversal', reversalOf: target.id, sourceRefundId: target.sourceRefundId, note: String(input.note).trim().slice(0, 3000) };
  }
  return { kind: 'allocation', ...validateRefundAllocation(order, input) };
}

async function reconcileGiveOne(sessionId, appended, context) {
  if (!process.env.STRIPE_SECRET_KEY) throw Object.assign(new Error('Stripe reconciliation is not configured.'), { statusCode: 503 });
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const proposal = await proposeStripeReconciliation(stripe, appended.order);
  const saved = await applyStripeReconciliation(appended.order, proposal, {
    expectedUpdatedAt: appended.order.updatedAt,
    source: `admin-v2:${context.userId}`,
    reason: appended.entry.kind === 'reversal' ? 'approved_refund_allocation_reversal' : 'approved_refund_allocation'
  });

  const obligations = (await listGiveOneObligations()).filter((item) => item.sourceCheckoutSessionId === sessionId);
  const unitKeys = wholeUnitKeys(proposal.lineSettlements);
  const affectedIds = obligations
    .filter((item) => unitKeys.has(`${item.sourceLineId}:${item.paidUnitIndex}`))
    .map((item) => item.obligationId);

  if (proposal.fullRefund) {
    await transitionGiveOneObligations({ sessionId, action: 'cancel', reason: 'verified_full_refund', eventId: appended.entry.sourceRefundId || '' });
  } else if (proposal.allocationRequired) {
    if (affectedIds.length) await transitionGiveOneObligations({ sessionId, obligationIds: affectedIds, action: 'cancel', reason: 'verified_whole_unit_refund', eventId: appended.entry.sourceRefundId || '' });
    await transitionGiveOneObligations({ sessionId, action: 'suspend', reason: 'refund_allocation_required', eventId: appended.entry.sourceRefundId || '' });
  } else {
    await transitionGiveOneObligations({ sessionId, action: 'reactivate', reason: 'refund_allocation_resolved', eventId: appended.entry.sourceRefundId || '' });
    if (affectedIds.length) await transitionGiveOneObligations({ sessionId, obligationIds: affectedIds, action: 'cancel', reason: 'verified_whole_unit_refund', eventId: appended.entry.sourceRefundId || '' });
  }
  return { saved, proposal, affectedIds };
}

const previewHandler = adminEndpoint({
  methods: ['POST'],
  permission: 'accountability.read',
  csrf: true,
  recentAuth: false,
  auditAction: 'refund_allocation.preview',
  rateClass: 'read',
  contentTypes: ['application/json'],
  maxBodyBytes: 250_000
}, async (request) => {
  const payload = await readJsonBody(request);
  const sessionId = text(payload.sessionId, 180);
  if (!sessionId) throw Object.assign(new Error('A stable Checkout Session/order reference is required.'), { statusCode: 400 });
  const order = await loadOrder(sessionId);
  const preview = previewAllocation(order, payload.allocation || {});
  return {
    response: json({ preview, expectedUpdatedAt: order.updatedAt || '' }),
    audit: { resourceType: 'refund_allocation', resourceId: sessionId, result: 'preview', afterSummary: preview }
  };
});

const requestHandler = adminEndpoint({
  methods: ['POST'],
  permission: 'accountability.write',
  csrf: true,
  recentAuth: true,
  auditAction: 'refund_allocation.request',
  rateClass: 'write',
  contentTypes: ['application/json'],
  maxBodyBytes: 250_000
}, async (request, context) => {
  const payload = await readJsonBody(request);
  const sessionId = text(payload.sessionId, 180);
  if (!sessionId) throw Object.assign(new Error('A stable Checkout Session/order reference is required.'), { statusCode: 400 });
  const reason = requiredExplanation(payload.reason);
  const order = await loadOrder(sessionId);
  const preview = previewAllocation(order, payload.allocation || {});
  const financialAction = await createFinancialActionRequest({
    type: 'refund_allocation',
    resourceId: sessionId,
    actionPayload: { sessionId, allocation: payload.allocation || {} },
    expectedUpdatedAt: order.updatedAt || '',
    previewSummary: preview,
    reason,
    context
  });
  return {
    response: json({ financialAction, preview }, 202),
    audit: { resourceType: 'financial_action', resourceId: financialAction.id, reason, afterSummary: financialAction }
  };
});

const applyHandler = adminEndpoint({
  methods: ['POST'],
  permission: 'accountability.approve',
  csrf: true,
  recentAuth: true,
  auditAction: 'refund_allocation.apply',
  rateClass: 'write',
  contentTypes: ['application/json'],
  maxBodyBytes: 100_000
}, async (request, context) => {
  const payload = await readJsonBody(request);
  const financialActionId = text(payload.financialActionId, 200);
  const reason = requiredExplanation(payload.reason);
  if (!financialActionId) throw Object.assign(new Error('A pending financial action request is required.'), { statusCode: 400 });
  const claim = await beginFinancialActionReview(financialActionId, context, { reason, confirmSameActor: payload.confirmSameActor === true });
  if (claim.record.type !== 'refund_allocation') {
    await failFinancialActionReview(financialActionId, claim.reviewToken, Object.assign(new Error('The financial action type does not match refund allocation.'), { code: 'type_mismatch' }));
    throw Object.assign(new Error('The selected financial action is not a refund allocation request.'), { statusCode: 409 });
  }

  let mutationStarted = false;
  try {
    const sessionId = text(claim.record.actionPayload?.sessionId, 180);
    const allocation = claim.record.actionPayload?.allocation || {};
    const order = await loadOrder(sessionId);
    if (claim.record.expectedUpdatedAt !== order.updatedAt) {
      throw Object.assign(new Error('The order changed after the refund-allocation request was created. Generate a fresh preview and request.'), { statusCode: 409 });
    }
    previewAllocation(order, allocation);
    mutationStarted = true;
    const appended = await appendRefundAllocation(sessionId, allocation, {
      expectedUpdatedAt: claim.record.expectedUpdatedAt,
      actorType: 'admin-user',
      actorId: context.userId
    });
    const { saved, affectedIds } = await reconcileGiveOne(sessionId, appended, context);
    const completed = await completeFinancialActionReview(financialActionId, claim.reviewToken, {
      sessionId,
      allocationId: appended.entry.id,
      reconciliationStatus: saved.payment?.reconciliationStatus || '',
      affectedGiveOneObligationCount: affectedIds.length,
      appliedByAdministratorId: context.userId
    });
    return {
      response: json({
        financialAction: completed,
        allocation: appended.entry,
        payment: saved.payment,
        reconciliationStatus: saved.payment?.reconciliationStatus || '',
        affectedGiveOneObligationCount: affectedIds.length
      }),
      audit: { resourceType: 'financial_action', resourceId: financialActionId, reason, beforeSummary: claim.request, afterSummary: completed }
    };
  } catch (error) {
    await failFinancialActionReview(financialActionId, claim.reviewToken, error, { partial: mutationStarted }).catch(() => null);
    throw error;
  }
});

export default async (request) => {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  const mode = await request.clone().json().then((payload) => payload?.mode || 'preview').catch(() => 'preview');
  if (mode === 'apply') return applyHandler(request);
  if (mode === 'request') return requestHandler(request);
  return previewHandler(request);
};
