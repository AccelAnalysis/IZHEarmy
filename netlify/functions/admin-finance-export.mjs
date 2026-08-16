import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import { boundedInteger, readJsonBody, requiredExplanation, text } from './_shared/admin-request.mjs';
import { listCampaigns, listStoreJSON } from './_shared/campaign-service.mjs';
import { listLedgerEntries } from './_shared/accountability-service.mjs';
import { organizationAccountability } from './_shared/accountability-rules.mjs';
import { cents, normalizeLegacyPayment } from './_shared/payment-rules.mjs';

const dollars = (value) => (Number(value || 0) / 100).toFixed(2);
const safeCellValue = (value) => {
  const raw = String(value ?? '').replace(/[\r\n]+/g, ' ');
  return /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
};
const quote = (value) => `"${safeCellValue(value).replaceAll('"', '""')}"`;
const csv = (rows) => `${rows.map((row) => row.map(quote).join(',')).join('\r\n')}\r\n`;

function parseDate(value, end = false) {
  if (!value) return null;
  const date = new Date(`${value}T${end ? '23:59:59.999' : '00:00:00.000'}Z`);
  if (Number.isNaN(date.valueOf())) throw Object.assign(new Error('Export date filters must be valid dates.'), { statusCode: 400 });
  return date;
}

function inRange(value, from, to) {
  if (!from && !to) return true;
  const date = new Date(value || 0);
  if (Number.isNaN(date.valueOf())) return false;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function orderRow(order, obligations) {
  const payment = order.payment || normalizeLegacyPayment(order);
  const amount = payment.amounts || {};
  const orderObligations = obligations.filter((item) => item.sourceCheckoutSessionId === order.sessionId);
  const count = (status) => orderObligations.filter((item) => item.status === status).length;
  return [
    order.campaignId || '', order.campaign?.title || '', order.sessionId || '', payment.reconciliationStatus || '', payment.currency || order.currency || 'usd',
    cents(amount.merchandiseGross), dollars(amount.merchandiseGross), cents(amount.discountTotal), dollars(amount.discountTotal),
    cents(amount.merchandiseNetBeforeRefunds), dollars(amount.merchandiseNetBeforeRefunds), cents(amount.merchandiseRefunded), dollars(amount.merchandiseRefunded),
    cents(amount.refundUnallocated), cents(amount.shippingCollected), cents(amount.shippingRefunded), cents(amount.taxCollected), cents(amount.taxRefunded),
    cents(amount.totalCharged), cents(amount.totalRefunded), cents(amount.openDisputeAmount), cents(amount.lostDisputeAmount), cents(amount.netCollected), cents(amount.amountHeld),
    order.supportPolicy?.policyVersion || '', cents(order.accountabilityProjection?.calculated), cents(order.accountabilityProjection?.held),
    orderObligations.length, count('active'), count('suspended_payment_review'), count('redeemed'), count('in_fulfillment'), count('fulfilled'), count('cancelled'),
    order.createdAt || '', payment.paidAt || '', payment.lastReconciledAt || ''
  ];
}

function summaryRows(report) {
  return [[
    'campaign_id','campaign_title','organization','campaign_status','settlement_status','currency',
    'merchandise_gross_cents','discount_cents','merchandise_net_cents','merchandise_refund_cents','refund_unallocated_cents',
    'shipping_collected_cents','shipping_refunded_cents','tax_collected_cents','tax_refunded_cents','total_charged_cents','total_refunded_cents',
    'open_dispute_cents','lost_dispute_cents','net_collected_cents','amount_held_cents','support_calculated_cents','support_held_cents',
    'support_paid_cents','support_outstanding_cents','support_overpaid_cents','give_one_issued','give_one_active','give_one_suspended',
    'give_one_redeemed','give_one_pending_fulfillment','give_one_fulfilled','give_one_cancelled','give_one_exceptions','created_or_start_timestamp','reconciled_timestamp'
  ], ...(report.campaigns || []).map((item) => [
    item.campaignId, item.title, item.organization, item.status, item.settlementStatus, 'usd', item.merchandiseGross, item.discountTotal,
    item.netRecognizedMerchandiseRevenue, item.merchandiseRefunded, item.refundUnallocated, item.shippingCollected, item.shippingRefunded,
    item.taxCollected, item.taxRefunded, item.totalCharged, item.totalRefunded, item.openDisputeAmount, item.finalDisputeLoss, item.netCollected,
    item.amountHeld, item.supportCalculated, item.supportHeld, item.supportPaid, item.supportOutstanding, item.supportOverpaid,
    item.giveCodesIssued, item.activeGiftObligations, item.suspendedGiftObligations, item.redeemedGiftObligations, item.pendingGiftFulfillment,
    item.fulfilledGifts, item.cancelledGiftObligations, item.giftExceptionCount, item.startAt, item.settlementUpdatedAt
  ])];
}

function ledgerRows(entries) {
  return [[
    'entry_id','idempotency_key','source','actor_type','campaign_id','type','amount_cents','amount_dollars','currency','effective_timestamp',
    'related_order','related_payment','related_settlement','policy_version','reversal_of','reference','note','created_timestamp'
  ], ...entries.map((entry) => [
    entry.id, entry.idempotencyKey, entry.source, entry.actorType, entry.campaignId, entry.type, entry.amount, dollars(entry.amount), entry.currency || 'usd',
    entry.effectiveAt, entry.relatedOrderId, entry.relatedPaymentId, entry.relatedSettlementId, entry.policyVersion, entry.reversalOf, entry.reference, entry.note, entry.createdAt
  ])];
}

function orderRows(orders, obligations) {
  return [[
    'campaign_id','campaign_title','order_session_reference','payment_reconciliation_state','currency','merchandise_gross_cents','merchandise_gross_dollars',
    'discount_cents','discount_dollars','merchandise_net_cents','merchandise_net_dollars','merchandise_refund_cents','merchandise_refund_dollars',
    'refund_unallocated_cents','shipping_collected_cents','shipping_refunded_cents','tax_collected_cents','tax_refunded_cents','total_charged_cents',
    'total_refunded_cents','open_dispute_cents','lost_dispute_cents','net_collected_cents','amount_held_cents','support_policy_version','support_calculated_cents',
    'support_held_cents','give_one_obligations','give_one_active','give_one_suspended','give_one_redeemed','give_one_in_fulfillment','give_one_fulfilled',
    'give_one_cancelled','created_timestamp','paid_timestamp','reconciled_timestamp'
  ], ...orders.map((order) => orderRow(order, obligations))];
}

export default adminEndpoint({
  methods: ['POST'],
  permission: 'accountability.export',
  csrf: true,
  recentAuth: true,
  auditAction: 'accountability.export',
  rateClass: 'export',
  contentTypes: ['application/json'],
  maxBodyBytes: 100_000
}, async (request) => {
  const body = await readJsonBody(request);
  const type = text(body.type || 'summary', 40);
  if (!['summary', 'campaigns', 'ledger', 'orders'].includes(type)) throw Object.assign(new Error('Unsupported accountability export type.'), { statusCode: 400 });
  if (body.confirmExport !== true) throw Object.assign(new Error('Explicit confirmation is required for an accountability export.'), { statusCode: 400 });
  const reason = requiredExplanation(body.reason);
  const campaignId = text(body.campaignId, 120);
  const maxRows = boundedInteger(body.maxRows, 500, { min: 1, max: 5000 });
  const dateFrom = parseDate(body.dateFrom, false);
  const dateTo = parseDate(body.dateTo, true);
  if (dateFrom && dateTo && dateTo < dateFrom) throw Object.assign(new Error('dateTo must be on or after dateFrom.'), { statusCode: 400 });
  if (type === 'ledger' && (!dateFrom || !dateTo)) throw Object.assign(new Error('Ledger exports require a bounded date range.'), { statusCode: 400 });
  if (dateFrom && dateTo && dateTo - dateFrom > 366 * 24 * 60 * 60 * 1000) throw Object.assign(new Error('Accountability exports are limited to a 366-day date range.'), { statusCode: 400 });

  const [campaigns, orders, codes, obligations, redemptions, batches, ledger, reconciliationTasks, stripeEvents, workflows] = await Promise.all([
    listCampaigns(), listStoreJSON('izhe-orders', 10000), listStoreJSON('izhe-give-codes', 10000), listStoreJSON('izhe-give-obligations', 10000),
    listStoreJSON('izhe-redemptions', 10000), listStoreJSON('izhe-production-batches', 10000), listLedgerEntries(),
    listStoreJSON('izhe-reconciliation-tasks', 10000), listStoreJSON('izhe-stripe-events', 10000), listStoreJSON('izhe-order-workflows', 10000)
  ]);
  const filteredOrders = orders.filter((order) => (!campaignId || order.campaignId === campaignId) && inRange(order.createdAt || order.updatedAt, dateFrom, dateTo));
  const filteredLedger = ledger.filter((entry) => (!campaignId || entry.campaignId === campaignId) && inRange(entry.effectiveAt || entry.createdAt, dateFrom, dateTo));
  const records = { orders: filteredOrders, codes, obligations, redemptions, batches, reconciliationTasks, stripeEvents, workflows };
  const selectedCampaigns = campaigns.filter((campaign) => !campaignId || campaign.id === campaignId);
  const report = organizationAccountability(selectedCampaigns, records, filteredLedger);

  let rows = type === 'ledger' ? ledgerRows(filteredLedger) : type === 'orders' ? orderRows(filteredOrders, obligations) : summaryRows(report);
  const dataRowCount = Math.max(0, rows.length - 1);
  if (dataRowCount > maxRows) throw Object.assign(new Error(`The export contains ${dataRowCount} rows, exceeding the ${maxRows}-row limit. Narrow the filters.`), { statusCode: 400 });
  const safeType = type === 'campaigns' ? 'summary' : type;
  const filename = `izhe-${safeType}-accountability-${new Date().toISOString().slice(0, 10)}.csv`;
  return {
    response: new Response(csv(rows), {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff'
      }
    }),
    audit: {
      resourceType: 'accountability_export',
      resourceId: campaignId || null,
      reason,
      afterSummary: { filename, type, rowCount: dataRowCount, campaignId: campaignId || null, dateFrom: dateFrom?.toISOString() || null, dateTo: dateTo?.toISOString() || null, bounded: true }
    }
  };
});
