import { requireAdmin } from './_shared/admin-auth.mjs';
import { computeCampaignMetrics } from './_shared/campaign-rules.mjs';
import { listCampaigns, listStoreJSON } from './_shared/campaign-service.mjs';

const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;

export default async (request) => {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: { allow: 'GET' } });
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const campaignId = new URL(request.url).searchParams.get('campaignId') || '';
    const [campaigns, orders, codes, redemptions, batches] = await Promise.all([
      listCampaigns(),
      listStoreJSON('izhe-orders'),
      listStoreJSON('izhe-give-codes'),
      listStoreJSON('izhe-redemptions'),
      listStoreJSON('izhe-production-batches')
    ]);
    const selected = campaignId ? campaigns.filter((item) => item.id === campaignId) : campaigns;
    const headers = ['Campaign ID', 'Campaign', 'Organization', 'Status', 'Start', 'End', 'Orders', 'Revenue', 'Units Sold', 'Codes Issued', 'Codes Redeemed', 'Claim Rate %', 'Gift Redemptions', 'Pending Fulfillment', 'Production Batches', 'Open Batches', 'Ministry Support', 'Support Model', 'Support Rate'];
    const rows = selected.map((campaign) => {
      const report = computeCampaignMetrics(campaign, { orders, codes, redemptions, batches });
      return [campaign.id, campaign.title, campaign.organization, campaign.status, campaign.startAt, campaign.endAt, report.orderCount, (report.revenue / 100).toFixed(2), report.soldUnits, report.codeCount, report.redeemedCodeCount, report.claimRate, report.redemptionCount, report.pendingFulfillmentCount, report.batchCount, report.openBatchCount, (report.supportAmount / 100).toFixed(2), campaign.supportModel, campaign.supportRate];
    });
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
    return new Response(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="izhe-campaign-report${campaignId ? `-${campaignId}` : ''}.csv"`,
        'cache-control': 'no-store'
      }
    });
  } catch (error) {
    console.error('admin-campaign-report', error);
    return new Response('Campaign report could not be generated.', { status: 500 });
  }
};
