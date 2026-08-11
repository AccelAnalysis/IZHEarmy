import { deterministicObligationId, cents } from './payment-rules.mjs';
import { transitionGiveOneObligations } from './give-one-service.mjs';
import {
  applyStripeReconciliation,
  createReconciliationTask,
  findOrderForStripeReferences,
  proposeStripeReconciliation,
  resolveReconciliationTask
} from './payment-service.mjs';

const isoFromStripeSeconds = (value) => Number.isFinite(Number(value)) ? new Date(Number(value) * 1000).toISOString() : new Date().toISOString();

export function stripeObjectReferences(object = {}) {
  const objectType = String(object?.object || '');
  const objectId = String(object?.id || '');
  const sessionId = objectType === 'checkout.session' ? objectId : '';
  const paymentIntentId = String(
    typeof object?.payment_intent === 'string' ? object.payment_intent : object?.payment_intent?.id || ''
  );
  const chargeId = String(
    objectType === 'charge'
      ? objectId
      : (typeof object?.charge === 'string' ? object.charge : object?.charge?.id || '')
  );
  return { sessionId, paymentIntentId, chargeId, objectId, objectType };
}

function wholeUnitObligationIds(order, lines) {
  const ids = [];
  for (const line of lines || []) {
    if (!line.giveOneEligible) continue;
    const giftUnits = Math.max(1, cents(line.giveOneUnitsPerPaidUnit, 1));
    for (const paidUnitIndex of line.allocatedWholeUnitReversals || []) {
      for (let giftUnitIndex = 0; giftUnitIndex < giftUnits; giftUnitIndex += 1) {
        ids.push(deterministicObligationId({
          sessionId: order.sessionId,
          lineId: line.lineId,
          paidUnitIndex,
          giftUnitIndex
        }));
      }
    }
  }
  return [...new Set(ids)];
}

async function unmatchedReversal(event, refs, reason) {
  await createReconciliationTask({
    type: 'unmatched_stripe_event',
    sourceId: event.id,
    severity: 'critical',
    message: `${reason} could not be matched to a local order. The verified Stripe event is retained for reconciliation.`,
    details: {
      stripeEventType: event.type,
      objectId: refs.objectId,
      objectType: refs.objectType,
      paymentIntentIdPresent: Boolean(refs.paymentIntentId),
      chargeIdPresent: Boolean(refs.chargeId)
    }
  });
  throw Object.assign(new Error(`${reason} could not be matched to an IZHE order.`), {
    code: 'stripe_event_unmatched',
    reconciliationRequired: true
  });
}

export async function processRefundEvent(stripe, event) {
  const refs = stripeObjectReferences(event.data?.object || {});
  const match = await findOrderForStripeReferences(refs, { repairIndexes: true });
  if (!match) return unmatchedReversal(event, refs, 'Stripe refund');
  const proposal = await proposeStripeReconciliation(stripe, match.order);
  const saved = await applyStripeReconciliation(match.order, proposal, {
    source: 'stripe-webhook',
    reason: event.type
  });

  if (proposal.fullRefund) {
    await transitionGiveOneObligations({
      sessionId: match.sessionId,
      action: 'cancel',
      reason: 'verified_full_refund',
      eventId: event.id
    });
  } else if (proposal.allocationRequired) {
    await transitionGiveOneObligations({
      sessionId: match.sessionId,
      action: 'suspend',
      reason: 'refund_allocation_required',
      eventId: event.id
    });
    await createReconciliationTask({
      type: 'refund_allocation_required',
      sessionId: match.sessionId,
      campaignId: saved.campaignId || '',
      sourceId: event.data?.object?.id || event.id,
      severity: 'critical',
      message: 'A verified partial refund cannot yet be assigned confidently to merchandise, shipping, tax, or whole units.',
      details: {
        totalRefunded: proposal.payment.amounts.totalRefunded,
        refundUnallocated: proposal.payment.amounts.refundUnallocated
      }
    });
  } else {
    const obligationIds = wholeUnitObligationIds(saved, proposal.lineSettlements);
    if (obligationIds.length) {
      await transitionGiveOneObligations({
        sessionId: match.sessionId,
        obligationIds,
        action: 'cancel',
        reason: 'verified_whole_unit_refund',
        eventId: event.id
      });
    }
  }

  return {
    sessionId: match.sessionId,
    order: saved,
    reconciliationStatus: proposal.payment.reconciliationStatus,
    allocationRequired: proposal.allocationRequired,
    fullRefund: proposal.fullRefund
  };
}

function disputeSourceId(event) {
  return String(event.data?.object?.id || event.id || '');
}

export async function processDisputeEvent(stripe, event) {
  const object = event.data?.object || {};
  const refs = stripeObjectReferences(object);
  const match = await findOrderForStripeReferences(refs, { repairIndexes: true });
  if (!match) return unmatchedReversal(event, refs, 'Stripe dispute');
  const proposal = await proposeStripeReconciliation(stripe, match.order);
  const disputeId = disputeSourceId(event);
  const disputedAmount = Math.max(0, cents(object.amount));
  const charged = Math.max(0, cents(proposal.payment.amounts.totalCharged));
  const disputeStatus = proposal.payment.disputeStatus;
  const partialLostRequiresAllocation = disputeStatus === 'lost' && disputedAmount > 0 && disputedAmount < charged;
  if (partialLostRequiresAllocation) proposal.payment.reconciliationStatus = 'allocation_required';

  const saved = await applyStripeReconciliation(match.order, proposal, {
    source: 'stripe-webhook',
    reason: event.type
  });

  const taskId = `open_dispute:${match.sessionId}:${disputeId}`;
  if (disputeStatus === 'open' || ['charge.dispute.created', 'charge.dispute.updated', 'charge.dispute.funds_withdrawn'].includes(event.type)) {
    await transitionGiveOneObligations({
      sessionId: match.sessionId,
      action: 'suspend',
      reason: 'open_payment_dispute',
      eventId: event.id
    });
    await createReconciliationTask({
      type: 'open_dispute',
      sessionId: match.sessionId,
      campaignId: saved.campaignId || '',
      sourceId: disputeId,
      severity: 'critical',
      message: 'Stripe reports an unresolved dispute. Mission support is held and unused Give One obligations are suspended pending resolution.',
      details: { disputedAmount, disputeStatus, stripeEventAt: isoFromStripeSeconds(event.created) }
    });
  }

  if (disputeStatus === 'won' || event.type === 'charge.dispute.funds_reinstated') {
    await transitionGiveOneObligations({
      sessionId: match.sessionId,
      action: 'reactivate',
      reason: 'dispute_resolved_funds_restored',
      eventId: event.id
    });
    await resolveReconciliationTask(taskId, 'Stripe dispute resolved with funds restored.').catch(() => {});
  }

  if (disputeStatus === 'lost') {
    if (disputedAmount >= charged && charged > 0) {
      await transitionGiveOneObligations({
        sessionId: match.sessionId,
        action: 'cancel',
        reason: 'verified_full_dispute_loss',
        eventId: event.id
      });
    } else {
      await transitionGiveOneObligations({
        sessionId: match.sessionId,
        action: 'suspend',
        reason: 'lost_dispute_allocation_required',
        eventId: event.id
      });
      await createReconciliationTask({
        type: 'lost_dispute_allocation_required',
        sessionId: match.sessionId,
        campaignId: saved.campaignId || '',
        sourceId: disputeId,
        severity: 'critical',
        message: 'A final lost dispute affects only part of the payment and requires allocation before unit-level obligations can be cancelled.',
        details: { disputedAmount, charged }
      });
    }
  }

  return {
    sessionId: match.sessionId,
    order: saved,
    reconciliationStatus: proposal.payment.reconciliationStatus,
    disputeStatus
  };
}
