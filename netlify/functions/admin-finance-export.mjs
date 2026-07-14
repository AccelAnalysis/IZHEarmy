import { requireAdmin } from './_shared/admin-auth.mjs';
import { listCampaigns, listStoreJSON } from './_shared/campaign-service.mjs';
import { listLedgerEntries } from './_shared/accountability-service.mjs';
import { organizationAccountability } from './_shared/accountability-rules.mjs';

const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
const csv = (rows) => rows.map((row) => row.map(quote).join(',')).join('\n');

export default async (request) => {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: { allow: 'GET' } });
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const type = new URL(request.url).searchParams.get('type') || 'campaigns';
    const [campaigns, orders, codes, redemptions, batches, ledger] = await Promise.all([
      listCampaigns(), listStoreJSON('izhe-orders'), listStoreJSON('izhe-give-codes'),
      listStoreJSON('izhe-redemptions'), listStoreJSON('izhe-production-batches'), listLedgerEntries()
    ]);
    const report = organizationAccountability(campaigns, { orders, codes, redemptions, batches }, ledger);
    let rows;
    if (type === 'ledger') {
      rows = [['Entry ID','Effective Date','Campaign ID','Type','Amount Cents','Reference','Related Order','Note','Created At'], ...report.ledger.map((entry) => [entry.id, entry.effectiveAt, entry.campaignId, entry.type, entry.amount, entry.reference, entry.relatedOrderId, entry.note, entry.createdAt])];
    } else {
      rows = [['Campaign ID','Organization','Campaign','Status','Orders','Merchandise Revenue Cents','Gross Collected Cents','Units','Support Calculated Cents','Support Adjustments Cents','Support Accrued Cents','Support Paid Cents','Support Outstanding Cents','Recorded Costs Cents','Give Codes','Redeemed Codes','Active Gift Obligations','Pending Gift Fulfillment','Fulfilled Gifts'], ...report.campaigns.map((item) => [item.campaignId, item.organization, item.title, item.status, item.orderCount, item.merchandiseRevenue, item.grossCollected, item.soldUnits, item.supportCalculated, item.supportAdjustments, item.supportAccrued, item.supportPaid, item.supportOutstanding, item.campaignCosts, item.giveCodesIssued, item.giveCodesRedeemed, item.activeGiftObligations, item.pendingGiftFulfillment, item.fulfilledGifts])];
    }
    const filename = `izhe-${type}-accountability-${new Date().toISOString().slice(0, 10)}.csv`;
    return new Response(csv(rows), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${filename}"`, 'cache-control': 'no-store' } });
  } catch (error) {
    console.error('admin-finance-export', error);
    return new Response('Financial export could not be generated.', { status: 500 });
  }
};
