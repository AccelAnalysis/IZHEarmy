import { requireAdmin } from './_shared/admin-auth.mjs';
import { listCampaigns, listStoreJSON } from './_shared/campaign-service.mjs';
import { listLedgerEntries } from './_shared/accountability-service.mjs';
import { organizationAccountability } from './_shared/accountability-rules.mjs';

const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
const csv = (rows) => rows.map((row) => row.map(quote).join(',')).join('\n');
const dollars = (cents) => (Number(cents || 0) / 100).toFixed(2);

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
      rows = [['Entry ID','Effective Date','Campaign ID','Type','Settlement Status','Amount Dollars','Amount Cents','Reference','Related Order','Note','Created At'], ...report.ledger.map((entry) => [entry.id, entry.effectiveAt, entry.campaignId, entry.type, entry.settlementStatus, dollars(entry.amount), entry.amount, entry.reference, entry.relatedOrderId, entry.note, entry.createdAt])];
    } else {
      rows = [[
        'Campaign ID','Organization','Campaign','Campaign Status','Settlement Status','Start Date','End Date','Orders','Merchandise Revenue Dollars','Gross Collected Dollars','Refunds/Disputes Dollars','Units','Support Calculated Dollars','Support Adjustments Dollars','Support Accrued Dollars','Support Paid Dollars','Support Outstanding Dollars','Recorded Costs Dollars','Give Codes','Redeemed Codes','Active Gift Obligations','Pending Gift Fulfillment','Fulfilled Gifts'
      ], ...report.campaigns.map((item) => [item.campaignId, item.organization, item.title, item.status, item.settlementStatus, item.startAt, item.endAt, item.orderCount, dollars(item.merchandiseRevenue), dollars(item.grossCollected), dollars(item.refundsAndDisputes), item.soldUnits, dollars(item.supportCalculated), dollars(item.supportAdjustments), dollars(item.supportAccrued), dollars(item.supportPaid), dollars(item.supportOutstanding), dollars(item.campaignCosts), item.giveCodesIssued, item.giveCodesRedeemed, item.activeGiftObligations, item.pendingGiftFulfillment, item.fulfilledGifts])];
      rows.push(['GENERAL','','Organization-wide / general','','','','',0,dollars(report.general.merchandiseRevenue),dollars(report.general.grossCollected),'',0,'',dollars(report.general.supportAdjustments),dollars(report.general.supportAccrued),dollars(report.general.supportPaid),dollars(report.general.supportOutstanding),dollars(report.general.campaignCosts),'','','','','']);
    }
    const filename = `izhe-${type}-accountability-${new Date().toISOString().slice(0, 10)}.csv`;
    return new Response(csv(rows), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${filename}"`, 'cache-control': 'no-store' } });
  } catch (error) {
    console.error('admin-finance-export', error);
    return new Response('Financial export could not be generated.', { status: 500 });
  }
};
