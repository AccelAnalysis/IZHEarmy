import { requireAdmin } from './_shared/admin-auth.mjs';
import { listCampaigns, listStoreJSON } from './_shared/campaign-service.mjs';
import { listLedgerEntries } from './_shared/accountability-service.mjs';
import { organizationAccountability } from './_shared/accountability-rules.mjs';
import { cents, normalizeLegacyPayment } from './_shared/payment-rules.mjs';

const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
const csv = (rows) => rows.map((row) => row.map(quote).join(',')).join('\n');
const dollars = (value) => (Number(value || 0) / 100).toFixed(2);
const countByStatus = (rows, status) => rows.filter((row) => row.status === status).length;

function orderRow(order, obligations) {
  const payment = order.payment || normalizeLegacyPayment(order);
  const amount = payment.amounts || {};
  const lines = order.lineSettlements || [];
  const orderObligations = obligations.filter((item) => item.sourceCheckoutSessionId === order.sessionId);
  const eligibleUnits = lines.reduce((sum, line) => sum + (line.supportEligible ? Math.max(0, cents(line.supportEligibleQuantity) - (line.allocatedWholeUnitReversals || []).length) : 0), 0);
  return [
    order.campaignId || '', order.campaign?.title || '', order.sessionId, payment.reconciliationStatus, payment.currency || order.currency || 'usd',
    cents(amount.merchandiseGross), dollars(amount.merchandiseGross), cents(amount.discountTotal), dollars(amount.discountTotal),
    cents(amount.merchandiseNetBeforeRefunds), dollars(amount.merchandiseNetBeforeRefunds), cents(amount.merchandiseRefunded), dollars(amount.merchandiseRefunded),
    cents(amount.refundUnallocated), dollars(amount.refundUnallocated), cents(amount.shippingCollected), cents(amount.shippingRefunded), cents(amount.taxCollected), cents(amount.taxRefunded),
    cents(amount.totalCharged), dollars(amount.totalCharged), cents(amount.totalRefunded), dollars(amount.totalRefunded), cents(amount.openDisputeAmount), cents(amount.lostDisputeAmount),
    cents(amount.netCollected), dollars(amount.netCollected), cents(amount.amountHeld), dollars(amount.amountHeld), order.supportPolicy?.policyVersion || '',
    cents(order.accountabilityProjection?.calculated), cents(order.accountabilityProjection?.held), eligibleUnits,
    orderObligations.length, countByStatus(orderObligations, 'active'), countByStatus(orderObligations, 'suspended_payment_review'), countByStatus(orderObligations, 'redeemed'), countByStatus(orderObligations, 'in_fulfillment'), countByStatus(orderObligations, 'fulfilled'), countByStatus(orderObligations, 'cancelled'), orderObligations.filter((item) => item.status === 'exception_review' || item.exceptionState).length,
    (order.batchAssignments || []).some((assignment) => ['submitted', 'in_production', 'received', 'completed'].includes(assignment.batchStatus)) && (cents(amount.totalRefunded) > 0 || cents(amount.lostDisputeAmount) > 0) ? 'reconciliation_required' : '',
    order.createdAt || '', payment.paidAt || '', payment.lastReconciledAt || ''
  ];
}

export default async (request) => {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: { allow: 'GET' } });
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const type = new URL(request.url).searchParams.get('type') || 'campaigns';
    const [campaigns, orders, codes, obligations, redemptions, batches, ledger, reconciliationTasks, stripeEvents, workflows] = await Promise.all([
      listCampaigns(), listStoreJSON('izhe-orders', 10000), listStoreJSON('izhe-give-codes', 10000), listStoreJSON('izhe-give-obligations', 10000),
      listStoreJSON('izhe-redemptions', 10000), listStoreJSON('izhe-production-batches', 10000), listLedgerEntries(),
      listStoreJSON('izhe-reconciliation-tasks', 10000), listStoreJSON('izhe-stripe-events', 10000), listStoreJSON('izhe-order-workflows', 10000)
    ]);
    const records = { orders, codes, obligations, redemptions, batches, reconciliationTasks, stripeEvents, workflows };
    const report = organizationAccountability(campaigns, records, ledger);
    let rows;
    if (type === 'ledger') {
      rows = [['entry_id','idempotency_key','source','actor_type','campaign_id','type','amount_cents','amount_dollars','currency','effective_timestamp','related_order','related_payment','related_settlement','policy_version','reversal_of','reference','note','created_timestamp'], ...report.ledger.map((entry) => [entry.id, entry.idempotencyKey, entry.source, entry.actorType, entry.campaignId, entry.type, entry.amount, dollars(entry.amount), entry.currency || 'usd', entry.effectiveAt, entry.relatedOrderId, entry.relatedPaymentId, entry.relatedSettlementId, entry.policyVersion, entry.reversalOf, entry.reference, entry.note, entry.createdAt])];
    } else if (type === 'orders') {
      rows = [[
        'campaign_id','campaign_title','order_session_reference','payment_reconciliation_state','currency','merchandise_gross_cents','merchandise_gross_dollars','discount_cents','discount_dollars','merchandise_net_cents','merchandise_net_dollars','merchandise_refund_cents','merchandise_refund_dollars','refund_unallocated_cents','refund_unallocated_dollars','shipping_collected_cents','shipping_refunded_cents','tax_collected_cents','tax_refunded_cents','total_charged_cents','total_charged_dollars','total_refunded_cents','total_refunded_dollars','open_dispute_cents','lost_dispute_cents','net_collected_cents','net_collected_dollars','amount_held_cents','amount_held_dollars','support_policy_version','support_calculated_cents','support_held_cents','eligible_unit_count','give_one_obligations','give_one_active','give_one_suspended','give_one_redeemed','give_one_in_fulfillment','give_one_fulfilled','give_one_cancelled','give_one_exceptions','production_exception_state','created_timestamp','paid_timestamp','reconciled_timestamp'
      ], ...orders.map((order) => orderRow(order, obligations))];
    } else {
      rows = [[
        'campaign_id','campaign_title','organization','campaign_status','settlement_status','payment_reconciliation_state','currency','merchandise_gross_cents','merchandise_gross_dollars','discount_cents','discount_dollars','merchandise_net_cents','merchandise_net_dollars','merchandise_refund_cents','refund_unallocated_cents','shipping_collected_cents','shipping_refunded_cents','tax_collected_cents','tax_refunded_cents','total_charged_cents','total_refunded_cents','open_dispute_cents','lost_dispute_cents','net_collected_cents','amount_held_cents','support_calculated_cents','support_held_cents','support_paid_cents','support_outstanding_cents','support_overpaid_cents','eligible_unit_count','give_one_issued','give_one_active','give_one_suspended','give_one_redeemed','give_one_pending_fulfillment','give_one_fulfilled','give_one_cancelled','give_one_exceptions','created_or_start_timestamp','reconciled_timestamp'
      ], ...report.campaigns.map((item) => [item.campaignId, item.title, item.organization, item.status, item.settlementStatus, item.underReconciliation ? 'under_reconciliation' : 'reconciled', 'usd', item.merchandiseGross, dollars(item.merchandiseGross), item.discountTotal, dollars(item.discountTotal), item.netRecognizedMerchandiseRevenue, dollars(item.netRecognizedMerchandiseRevenue), item.merchandiseRefunded, item.refundUnallocated, item.shippingCollected, item.shippingRefunded, item.taxCollected, item.taxRefunded, item.totalCharged, item.totalRefunded, item.openDisputeAmount, item.finalDisputeLoss, item.netCollected, item.amountHeld, item.supportCalculated, item.supportHeld, item.supportPaid, item.supportOutstanding, item.supportOverpaid, item.operations?.paidUnits - item.operations?.refundedUnits, item.giveCodesIssued, item.activeGiftObligations, item.suspendedGiftObligations, item.redeemedGiftObligations, item.pendingGiftFulfillment, item.fulfilledGifts, item.cancelledGiftObligations, item.giftExceptionCount, item.startAt, item.settlementUpdatedAt])];
    }
    const filename = `izhe-${type}-accountability-${new Date().toISOString().slice(0, 10)}.csv`;
    return new Response(csv(rows), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${filename}"`, 'cache-control': 'no-store' } });
  } catch (error) {
    console.error('admin-finance-export', String(error?.message || error).slice(0, 500));
    return new Response('Financial export could not be generated.', { status: 500 });
  }
};
