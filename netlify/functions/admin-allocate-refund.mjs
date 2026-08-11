import Stripe from 'stripe';
import { requireAdmin } from './_shared/admin-auth.mjs';
import { listGiveOneObligations, transitionGiveOneObligations } from './_shared/give-one-service.mjs';
import { appendRefundAllocation } from './_shared/refund-allocation-service.mjs';
import { applyStripeReconciliation, proposeStripeReconciliation } from './_shared/payment-service.mjs';
import { json, methodNotAllowed } from './_shared/http.mjs';

function wholeUnitKeys(lines = []) {
  const keys = new Set();
  for (const line of lines) for (const index of line.allocatedWholeUnitReversals || []) keys.add(`${line.lineId}:${index}`);
  return keys;
}

export default async (request) => {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  const denied = requireAdmin(request);
  if (denied) return denied;
  if (!process.env.STRIPE_SECRET_KEY) return json({ error: 'Stripe reconciliation is not configured.' }, 503);
  try {
    const payload = await request.json();
    const sessionId = String(payload.sessionId || '').trim();
    if (!sessionId) return json({ error: 'A stable Checkout Session/order reference is required.' }, 400);
    const appended = await appendRefundAllocation(sessionId, payload.allocation || {}, {
      expectedUpdatedAt: payload.expectedUpdatedAt || '',
      actorType: 'admin-token'
    });
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const proposal = await proposeStripeReconciliation(stripe, appended.order);
    const saved = await applyStripeReconciliation(appended.order, proposal, {
      source: 'admin-token',
      reason: payload.allocation?.reversalOf ? 'refund_allocation_reversal' : 'refund_allocation'
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

    return json({
      allocation: appended.entry,
      payment: saved.payment,
      reconciliationStatus: saved.payment?.reconciliationStatus || '',
      affectedGiveOneObligationCount: affectedIds.length
    });
  } catch (error) {
    console.error('admin-allocate-refund', String(error?.message || error).slice(0, 500));
    return json({ error: error.message || 'Refund allocation could not be saved.' }, error.statusCode || 400);
  }
};
