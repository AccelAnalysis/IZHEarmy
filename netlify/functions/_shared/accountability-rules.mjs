import { effectiveCodeStatus } from './operations-rules.mjs';
import { cents, normalizeLegacyPayment, supportForOrder } from './payment-rules.mjs';

export const LEDGER_TYPES = [
  'support_adjustment',
  'support_payment',
  'payment_reversal',
  'campaign_cost',
  'cost_reversal',
  'accountability_note',
  'campaign_settlement'
];

export const SETTLEMENT_STATUSES = ['open', 'ready_for_review', 'reconciled', 'support_approved', 'payment_scheduled', 'paid', 'closed'];

const clean = (value, max = 1000) => String(value ?? '').trim().slice(0, max);

export function validateLedgerEntry(input, campaigns = []) {
  const type = LEDGER_TYPES.includes(input?.type) ? input.type : '';
  const campaignId = clean(input?.campaignId, 100);
  if (!type) throw new Error('Select a valid ledger entry type. Stripe refunds are payment facts and cannot be entered as manual refund ledger adjustments.');
  if (campaignId && !campaigns.some((campaign) => campaign.id === campaignId)) throw new Error('Select a valid campaign.');
  if (type === 'campaign_settlement' && !campaignId) throw new Error('Settlement status must be assigned to a campaign.');
  const settlementStatus = type === 'campaign_settlement' && SETTLEMENT_STATUSES.includes(input?.settlementStatus) ? input.settlementStatus : '';
  if (type === 'campaign_settlement' && !settlementStatus) throw new Error('Select a valid settlement status.');
  const amount = Math.round(Number(input?.amount || 0));
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || Math.abs(amount) > 1000000000) throw new Error('Enter a valid whole-cent amount.');
  if (!['accountability_note', 'campaign_settlement'].includes(type) && amount === 0) throw new Error('A financial ledger entry requires a non-zero amount.');
  if (['support_payment', 'payment_reversal', 'campaign_cost', 'cost_reversal'].includes(type) && amount < 0) throw new Error('Payments, reversals, and costs must be entered as positive amounts.');
  if (type === 'support_adjustment' && !clean(input?.note, 3000)) throw new Error('Adjustments require an explanation.');
  if (['payment_reversal', 'cost_reversal'].includes(type) && !clean(input?.note, 3000)) throw new Error('Reversals require an explanation.');
  const now = new Date().toISOString();
  const id = clean(input?.id, 180) || `LEDGER-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 9).toUpperCase()}`;
  const idempotencyKey = clean(input?.idempotencyKey || input?.id, 240) || id;
  return {
    id,
    idempotencyKey,
    campaignId,
    type,
    amount,
    currency: clean(input?.currency || 'usd', 12).toLowerCase(),
    settlementStatus,
    reference: clean(input?.reference, 240),
    note: clean(input?.note, 3000),
    relatedOrderId: clean(input?.relatedOrderId, 180),
    relatedPaymentId: clean(input?.relatedPaymentId, 180),
    relatedSettlementId: clean(input?.relatedSettlementId, 180),
    policyVersion: clean(input?.policyVersion, 180),
    reversalOf: clean(input?.reversalOf, 180),
    effectiveAt: input?.effectiveAt ? new Date(input.effectiveAt).toISOString() : now,
    createdAt: now,
    source: clean(input?.source || 'admin', 80),
    sourceEventId: clean(input?.sourceEventId, 180),
    actorType: clean(input?.actorType || 'admin-token', 80)
  };
}

export function ledgerTotals(entries) {
  const sum = (type) => entries.filter((entry) => entry.type === type).reduce((total, entry) => total + cents(entry.amount), 0);
  // refund_adjustment is read for backwards compatibility only. New validation does not permit it.
  return {
    supportAdjustments: sum('support_adjustment') + sum('refund_adjustment'),
    supportPayments: sum('support_payment') - sum('payment_reversal'),
    campaignCosts: sum('campaign_cost') - sum('cost_reversal')
  };
}

function paymentFor(order) { return order?.payment || normalizeLegacyPayment(order); }
function lineSettlements(order) { return Array.isArray(order?.lineSettlements) ? order.lineSettlements : []; }
function recognizedMerchandise(order) {
  const lines = lineSettlements(order);
  if (lines.length) return lines.reduce((sum, line) => sum + Math.max(0, cents(line.netRecognizedMerchandiseRevenue)), 0);
  const payment = paymentFor(order);
  return Math.max(0, cents(payment.amounts?.merchandiseNetBeforeRefunds) - cents(payment.amounts?.merchandiseRefunded));
}
function purchasedUnits(order) {
  const lines = lineSettlements(order);
  if (lines.length) return lines.reduce((sum, line) => sum + Math.max(0, cents(line.quantityPurchased)), 0);
  return (order.items || []).reduce((sum, item) => sum + Math.max(0, cents(item.quantity)), 0);
}
function refundedWholeUnits(order) {
  return lineSettlements(order).reduce((sum, line) => sum + (line.allocatedWholeUnitReversals || []).length, 0);
}
function paymentReconciled(order) {
  return ['reconciled', 'legacy_reconciled'].includes(paymentFor(order).reconciliationStatus);
}

function commerceTotals(orders) {
  return (orders || []).reduce((total, order) => {
    const payment = paymentFor(order);
    const amount = payment.amounts || {};
    total.merchandiseGross += Math.max(0, cents(amount.merchandiseGross));
    total.discountTotal += Math.max(0, cents(amount.discountTotal));
    total.merchandiseNetBeforeRefunds += Math.max(0, cents(amount.merchandiseNetBeforeRefunds));
    total.merchandiseRefunded += Math.max(0, cents(amount.merchandiseRefunded));
    total.netRecognizedMerchandiseRevenue += recognizedMerchandise(order);
    total.shippingCollected += Math.max(0, cents(amount.shippingCollected));
    total.shippingRefunded += Math.max(0, cents(amount.shippingRefunded));
    total.taxCollected += Math.max(0, cents(amount.taxCollected));
    total.taxRefunded += Math.max(0, cents(amount.taxRefunded));
    total.totalCharged += Math.max(0, cents(amount.totalCharged));
    total.totalRefunded += Math.max(0, cents(amount.totalRefunded));
    total.refundUnallocated += Math.max(0, cents(amount.refundUnallocated));
    total.openDisputeAmount += Math.max(0, cents(amount.openDisputeAmount));
    total.finalDisputeLoss += Math.max(0, cents(amount.lostDisputeAmount));
    total.netCollected += Math.max(0, cents(amount.netCollected));
    total.amountHeld += Math.max(0, cents(amount.amountHeld));
    if (Number.isInteger(amount.processorFee)) total.processorFee += amount.processorFee;
    else total.processorFeeVerified = false;
    if (Number.isInteger(amount.verifiedNetDeposit)) total.verifiedNetDeposit += amount.verifiedNetDeposit;
    else total.verifiedNetDepositVerified = false;
    total.paidUnits += purchasedUnits(order);
    total.refundedUnits += refundedWholeUnits(order);
    return total;
  }, {
    merchandiseGross: 0, discountTotal: 0, merchandiseNetBeforeRefunds: 0, merchandiseRefunded: 0, netRecognizedMerchandiseRevenue: 0,
    shippingCollected: 0, shippingRefunded: 0, taxCollected: 0, taxRefunded: 0, totalCharged: 0, totalRefunded: 0,
    refundUnallocated: 0, openDisputeAmount: 0, finalDisputeLoss: 0, netCollected: 0, amountHeld: 0,
    processorFee: 0, processorFeeVerified: true, verifiedNetDeposit: 0, verifiedNetDepositVerified: true,
    paidUnits: 0, refundedUnits: 0
  });
}

function orderSupport(order) {
  if (!order?.supportPolicy) return { calculated: 0, held: 0, qualifying: false, legacyUnreconciled: true, policyVersion: '' };
  const base = supportForOrder(order);
  const payment = paymentFor(order);
  const lost = Math.max(0, cents(payment.amounts?.lostDisputeAmount));
  const charged = Math.max(0, cents(payment.amounts?.totalCharged));
  if (lost > 0 && charged > 0 && lost >= charged) return { ...base, calculated: 0, held: 0, qualifying: false, fullyReversedByDispute: true, legacyUnreconciled: false };
  if (lost > 0 && !paymentReconciled(order)) return { ...base, held: base.calculated, legacyUnreconciled: false };
  return { ...base, legacyUnreconciled: false };
}

function supportTotals(orders) {
  let calculated = 0;
  let held = 0;
  let legacyUnreconciled = 0;
  const fixed = new Map();
  for (const order of orders || []) {
    const support = orderSupport(order);
    if (support.legacyUnreconciled) { legacyUnreconciled += 1; continue; }
    if (order.supportPolicy?.supportModel === 'fixed') {
      const key = support.policyVersion || order.supportPolicy.policyVersion || 'fixed-unversioned';
      const current = fixed.get(key) || { rate: Math.round(Number(order.supportPolicy.supportRate || 0)), clear: false, held: false };
      if (support.qualifying && support.calculated > 0) {
        if (support.held > 0) current.held = true;
        else current.clear = true;
      }
      fixed.set(key, current);
    } else {
      calculated += support.calculated;
      held += support.held;
    }
  }
  for (const value of fixed.values()) {
    if (!value.clear && !value.held) continue;
    calculated += value.rate;
    if (!value.clear && value.held) held += value.rate;
  }
  return { supportCalculated: calculated, supportHeld: Math.min(calculated, held), legacyUnreconciled };
}

function giftCounts(campaignId, records) {
  const obligations = (records.obligations || []).filter((item) => item.campaignId === campaignId);
  if (obligations.length) {
    const count = (status) => obligations.filter((item) => item.status === status).length;
    return {
      obligationsIssued: obligations.length,
      activeObligations: count('active'),
      suspendedObligations: count('suspended_payment_review'),
      redeemedObligations: count('redeemed'),
      pendingGiftFulfillment: count('redeemed') + count('in_fulfillment'),
      fulfilledObligations: count('fulfilled'),
      cancelledObligations: count('cancelled'),
      exceptionObligations: count('exception_review') + obligations.filter((item) => Boolean(item.exceptionState)).length,
      claimRate: obligations.length ? Math.round(obligations.filter((item) => ['redeemed', 'in_fulfillment', 'fulfilled'].includes(item.status)).length / obligations.length * 1000) / 10 : 0
    };
  }
  const codes = (records.codes || []).filter((item) => item.campaignId === campaignId);
  const status = (value) => codes.filter((item) => effectiveCodeStatus(item) === value).length;
  const fulfilled = (records.redemptions || []).filter((item) => item.campaignId === campaignId && item.status === 'fulfilled').length;
  const pending = (records.redemptions || []).filter((item) => item.campaignId === campaignId && !['fulfilled', 'cancelled'].includes(item.status)).length;
  return {
    obligationsIssued: codes.length,
    activeObligations: status('active'),
    suspendedObligations: status('suspended_payment_review'),
    redeemedObligations: status('redeemed'),
    pendingGiftFulfillment: pending,
    fulfilledObligations: fulfilled,
    cancelledObligations: status('cancelled'),
    exceptionObligations: 0,
    claimRate: codes.length ? Math.round(status('redeemed') / codes.length * 1000) / 10 : 0
  };
}

function reconciliationCounts(orders, records, campaignId = '') {
  const orderIds = new Set((orders || []).map((order) => order.sessionId));
  const tasks = (records.reconciliationTasks || []).filter((task) => (!campaignId || task.campaignId === campaignId || orderIds.has(task.sessionId)) && task.state !== 'resolved');
  const events = (records.stripeEvents || []).filter((event) => orderIds.has(event.orderId) || orderIds.has(event.checkoutSessionId));
  const workflows = (records.workflows || []).filter((workflow) => orderIds.has(workflow.sessionId));
  const paymentState = (order) => paymentFor(order);
  return {
    reconciledOrderCount: (orders || []).filter(paymentReconciled).length,
    unreconciledOrderCount: (orders || []).filter((order) => !paymentReconciled(order)).length,
    unmatchedStripeEventCount: events.filter((event) => event.processingState === 'reconciliation_required' || event.reconciliationState === 'event_unmatched').length + tasks.filter((task) => task.type === 'unmatched_stripe_event').length,
    missingIndexCount: (orders || []).filter((order) => paymentState(order).reconciliationStatus === 'index_repair_required').length + tasks.filter((task) => task.type.includes('index')).length,
    refundAllocationRequiredCount: (orders || []).filter((order) => paymentState(order).refundStatus === 'allocation_required' || paymentState(order).reconciliationStatus === 'allocation_required').length,
    openDisputeCount: (orders || []).filter((order) => paymentState(order).disputeStatus === 'open').length,
    legacyUnreconciledCount: (orders || []).filter((order) => ['legacy_unreconciled', 'stripe_backfill_available', 'stripe_reference_missing'].includes(paymentState(order).reconciliationStatus)).length,
    failedWorkflowCount: workflows.filter((workflow) => workflow.state === 'failed_retryable').length,
    staleLeaseCount: tasks.filter((task) => task.type === 'stale_lease').length
  };
}

function operationsCounts(orders, records) {
  const church = (orders || []).filter((order) => order.fulfillment?.mode === 'church_batch');
  const direct = (orders || []).filter((order) => order.fulfillment?.mode !== 'church_batch');
  const productionUnits = (orders || []).reduce((sum, order) => sum + (order.batchAssignments || []).filter((assignment) => ['submitted', 'in_production', 'received', 'completed'].includes(assignment.batchStatus)).reduce((inside, assignment) => inside + Math.max(0, cents(assignment.quantity)), 0), 0);
  const openTasks = (records.reconciliationTasks || []).filter((task) => task.state !== 'resolved');
  return {
    paidUnits: (orders || []).reduce((sum, order) => sum + purchasedUnits(order), 0),
    refundedUnits: (orders || []).reduce((sum, order) => sum + refundedWholeUnits(order), 0),
    unresolvedRefundAllocations: (orders || []).filter((order) => Math.max(0, cents(paymentFor(order).amounts?.refundUnallocated)) > 0).length,
    churchBatchUnits: church.reduce((sum, order) => sum + purchasedUnits(order), 0),
    individuallyShippedUnits: direct.reduce((sum, order) => sum + purchasedUnits(order), 0),
    unitsAllocatedToProduction: productionUnits,
    postSubmissionRefundExceptions: openTasks.filter((task) => ['post_production_reversal', 'batch_reconciliation'].includes(task.type)).length,
    pickupCompletionCount: church.filter((order) => order.fulfillment?.status === 'picked_up').length
  };
}

function orderSummary(order) {
  const payment = paymentFor(order);
  return {
    sessionId: order.sessionId,
    createdAt: order.createdAt,
    paidAt: payment.paidAt || order.createdAt,
    status: order.status,
    paymentStatus: payment.captureStatus,
    refundStatus: payment.refundStatus,
    disputeStatus: payment.disputeStatus,
    reconciliationStatus: payment.reconciliationStatus,
    merchandiseGross: cents(payment.amounts?.merchandiseGross),
    discountTotal: cents(payment.amounts?.discountTotal),
    merchandiseNetBeforeRefunds: cents(payment.amounts?.merchandiseNetBeforeRefunds),
    merchandiseRefunded: cents(payment.amounts?.merchandiseRefunded),
    netRecognizedMerchandiseRevenue: recognizedMerchandise(order),
    shippingCollected: cents(payment.amounts?.shippingCollected),
    shippingRefunded: cents(payment.amounts?.shippingRefunded),
    taxCollected: cents(payment.amounts?.taxCollected),
    taxRefunded: cents(payment.amounts?.taxRefunded),
    totalCharged: cents(payment.amounts?.totalCharged),
    totalRefunded: cents(payment.amounts?.totalRefunded),
    refundUnallocated: cents(payment.amounts?.refundUnallocated),
    openDisputeAmount: cents(payment.amounts?.openDisputeAmount),
    netCollected: cents(payment.amounts?.netCollected),
    amountHeld: cents(payment.amounts?.amountHeld),
    currency: payment.currency || 'usd',
    supportPolicyVersion: order.supportPolicy?.policyVersion || '',
    units: purchasedUnits(order),
    refundedUnits: refundedWholeUnits(order),
    lastReconciledAt: payment.lastReconciledAt || ''
  };
}

export function campaignAccountability(campaign, records, ledger = []) {
  const campaignOrders = (records.orders || []).filter((order) => order.campaignId === campaign.id);
  const entries = ledger.filter((entry) => entry.campaignId === campaign.id).sort((a, b) => new Date(b.effectiveAt) - new Date(a.effectiveAt));
  const ledgerSummary = ledgerTotals(entries);
  const commerce = commerceTotals(campaignOrders);
  const support = supportTotals(campaignOrders);
  const supportAccrued = support.supportCalculated + ledgerSummary.supportAdjustments;
  const supportHeld = Math.min(Math.max(0, supportAccrued), Math.max(0, support.supportHeld));
  const supportAvailable = Math.max(0, supportAccrued - supportHeld);
  const supportPaid = ledgerSummary.supportPayments;
  const supportOutstanding = Math.max(0, supportAvailable - supportPaid);
  const supportOverpaid = Math.max(0, supportPaid - supportAvailable);
  const gifts = giftCounts(campaign.id, records);
  const reconciliation = reconciliationCounts(campaignOrders, records, campaign.id);
  const operations = operationsCounts(campaignOrders, records);
  const latestSettlement = entries.find((entry) => entry.type === 'campaign_settlement');
  const underReconciliation = reconciliation.unreconciledOrderCount > 0 || reconciliation.unmatchedStripeEventCount > 0 || reconciliation.refundAllocationRequiredCount > 0 || reconciliation.openDisputeCount > 0 || gifts.exceptionObligations > 0;
  return {
    campaignId: campaign.id,
    organization: campaign.organization,
    title: campaign.title,
    status: campaign.status,
    startAt: campaign.startAt || '',
    endAt: campaign.endAt || '',
    settlementStatus: latestSettlement?.settlementStatus || 'open',
    settlementUpdatedAt: latestSettlement?.effectiveAt || '',
    underReconciliation,
    ...commerce,
    merchandiseRevenue: commerce.netRecognizedMerchandiseRevenue,
    grossCollected: commerce.totalCharged,
    refundsAndDisputes: commerce.totalRefunded + commerce.finalDisputeLoss,
    orderCount: campaignOrders.length,
    soldUnits: operations.paidUnits,
    supportCalculated: support.supportCalculated,
    supportAdjustments: ledgerSummary.supportAdjustments,
    supportHeld,
    supportAccrued,
    supportAvailable,
    supportPaid,
    supportOutstanding,
    supportOverpaid,
    supportRecoveryRequired: supportOverpaid,
    campaignCosts: ledgerSummary.campaignCosts,
    giveCodesIssued: gifts.obligationsIssued,
    giveCodesRedeemed: gifts.redeemedObligations,
    activeGiftObligations: gifts.activeObligations,
    suspendedGiftObligations: gifts.suspendedObligations,
    redeemedGiftObligations: gifts.redeemedObligations,
    pendingGiftFulfillment: gifts.pendingGiftFulfillment,
    fulfilledGifts: gifts.fulfilledObligations,
    cancelledGiftObligations: gifts.cancelledObligations,
    giftExceptionCount: gifts.exceptionObligations,
    claimRate: gifts.claimRate,
    reconciliation: { ...reconciliation, supportOverpaidCount: supportOverpaid > 0 ? 1 : 0, giveOneExceptionCount: gifts.exceptionObligations },
    operations,
    entries,
    orderSummaries: campaignOrders.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).map(orderSummary),
    batchSummaries: (records.batches || []).filter((batch) => batch.campaignId === campaign.id).map((batch) => ({ id: batch.id, name: batch.name, status: batch.status, dueDate: batch.dueDate || '', tracking: batch.tracking || '', itemCount: (batch.items || []).reduce((total, item) => total + Number(item.quantity || 0), 0) }))
  };
}

export function organizationAccountability(campaigns, records, ledger = []) {
  const campaignReports = campaigns.map((campaign) => campaignAccountability(campaign, records, ledger));
  const generalOrders = (records.orders || []).filter((order) => !order.campaignId);
  const generalEntries = ledger.filter((entry) => !entry.campaignId);
  const generalLedger = ledgerTotals(generalEntries);
  const generalCommerce = commerceTotals(generalOrders);
  const generalSupportAccrued = generalLedger.supportAdjustments;
  const generalSupportPaid = generalLedger.supportPayments;
  const generalSupportAvailable = Math.max(0, generalSupportAccrued);
  const generalSupportOutstanding = Math.max(0, generalSupportAvailable - generalSupportPaid);
  const generalSupportOverpaid = Math.max(0, generalSupportPaid - generalSupportAvailable);
  const total = (key) => campaignReports.reduce((sum, report) => sum + Number(report[key] || 0), 0);
  const allReconciliation = reconciliationCounts(records.orders || [], records);
  const allObligations = records.obligations || [];
  const allCodes = records.codes || [];
  const activeGiftObligations = allObligations.length ? allObligations.filter((item) => item.status === 'active').length : allCodes.filter((code) => effectiveCodeStatus(code) === 'active').length;
  const pendingGiftFulfillment = allObligations.length ? allObligations.filter((item) => ['redeemed', 'in_fulfillment'].includes(item.status)).length : (records.redemptions || []).filter((item) => !['fulfilled', 'cancelled'].includes(item.status)).length;
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      merchandiseGross: total('merchandiseGross') + generalCommerce.merchandiseGross,
      discountTotal: total('discountTotal') + generalCommerce.discountTotal,
      netRecognizedMerchandiseRevenue: total('netRecognizedMerchandiseRevenue') + generalCommerce.netRecognizedMerchandiseRevenue,
      merchandiseRevenue: total('netRecognizedMerchandiseRevenue') + generalCommerce.netRecognizedMerchandiseRevenue,
      totalCharged: total('totalCharged') + generalCommerce.totalCharged,
      grossCollected: total('totalCharged') + generalCommerce.totalCharged,
      totalRefunded: total('totalRefunded') + generalCommerce.totalRefunded,
      openDisputeAmount: total('openDisputeAmount') + generalCommerce.openDisputeAmount,
      amountHeld: total('amountHeld') + generalCommerce.amountHeld,
      netCollected: total('netCollected') + generalCommerce.netCollected,
      supportCalculated: total('supportCalculated'),
      supportHeld: total('supportHeld'),
      supportAccrued: total('supportAccrued') + generalSupportAccrued,
      supportAvailable: total('supportAvailable') + generalSupportAvailable,
      supportPaid: total('supportPaid') + generalSupportPaid,
      supportOutstanding: total('supportOutstanding') + generalSupportOutstanding,
      supportOverpaid: total('supportOverpaid') + generalSupportOverpaid,
      campaignCosts: total('campaignCosts') + generalLedger.campaignCosts,
      activeGiftObligations,
      pendingGiftFulfillment,
      campaignCount: campaigns.length,
      openCampaignCount: campaigns.filter((campaign) => !['fulfilled', 'cancelled'].includes(campaign.status)).length,
      underReconciliation: allReconciliation.unreconciledOrderCount > 0 || allReconciliation.unmatchedStripeEventCount > 0 || allReconciliation.refundAllocationRequiredCount > 0 || allReconciliation.openDisputeCount > 0,
      reconciliation: { ...allReconciliation, supportOverpaidCount: campaignReports.filter((report) => report.supportOverpaid > 0).length + (generalSupportOverpaid > 0 ? 1 : 0), giveOneExceptionCount: allObligations.filter((item) => item.status === 'exception_review' || item.exceptionState).length }
    },
    general: {
      ...generalCommerce,
      merchandiseRevenue: generalCommerce.netRecognizedMerchandiseRevenue,
      grossCollected: generalCommerce.totalCharged,
      supportAdjustments: generalLedger.supportAdjustments,
      supportAccrued: generalSupportAccrued,
      supportAvailable: generalSupportAvailable,
      supportPaid: generalSupportPaid,
      supportOutstanding: generalSupportOutstanding,
      supportOverpaid: generalSupportOverpaid,
      campaignCosts: generalLedger.campaignCosts,
      entries: generalEntries.sort((a, b) => new Date(b.effectiveAt) - new Date(a.effectiveAt))
    },
    campaigns: campaignReports.sort((a, b) => b.netRecognizedMerchandiseRevenue - a.netRecognizedMerchandiseRevenue),
    ledger: [...ledger].sort((a, b) => new Date(b.effectiveAt) - new Date(a.effectiveAt))
  };
}
