import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import { boundedInteger, readJsonBody, requiredExplanation, text } from './_shared/admin-request.mjs';
import { computeCampaignMetrics } from './_shared/campaign-rules.mjs';
import { listCampaigns, listStoreJSON } from './_shared/campaign-service.mjs';

function safeSpreadsheetValue(value) {
  const raw = String(value ?? '').replace(/[\r\n]+/g, ' ');
  return /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
}
const csvCell = (value) => `"${safeSpreadsheetValue(value).replaceAll('"', '""')}"`;

export default adminEndpoint({
  methods: ['POST'],
  permission: 'campaigns.export',
  csrf: true,
  recentAuth: true,
  auditAction: 'campaign_report.export',
  rateClass: 'export',
  contentTypes: ['application/json'],
  maxBodyBytes: 100_000
}, async (request) => {
  const body = await readJsonBody(request);
  const campaignId = text(body.campaignId, 120);
  const reason = requiredExplanation(body.reason);
  const maxCampaigns = boundedInteger(body.maxCampaigns, 500, { min: 1, max: 1_000 });
  if (body.confirmExport !== true) throw Object.assign(new Error('Explicit confirmation is required for a campaign report export.'), { statusCode: 400 });

  const [campaigns, orders, codes, redemptions, batches] = await Promise.all([
    listCampaigns(),
    listStoreJSON('izhe-orders'),
    listStoreJSON('izhe-give-codes'),
    listStoreJSON('izhe-redemptions'),
    listStoreJSON('izhe-production-batches')
  ]);
  let selected = campaignId ? campaigns.filter((item) => item.id === campaignId) : campaigns;
  if (campaignId && !selected.length) throw Object.assign(new Error('Campaign not found.'), { statusCode: 404 });
  if (body.status) selected = selected.filter((item) => item.status === text(body.status, 60));
  if (selected.length > maxCampaigns) {
    throw Object.assign(new Error(`The campaign report contains ${selected.length} campaigns, exceeding the ${maxCampaigns}-campaign limit. Narrow the filters.`), { statusCode: 400 });
  }

  const headers = [
    'Campaign ID', 'Campaign', 'Organization', 'Status', 'Start', 'End', 'Orders', 'Revenue',
    'Units Sold', 'Codes Issued', 'Codes Redeemed', 'Claim Rate %', 'Gift Redemptions',
    'Pending Fulfillment', 'Production Batches', 'Open Batches', 'Ministry Support',
    'Support Model', 'Support Rate'
  ];
  const rows = selected.map((campaign) => {
    const report = computeCampaignMetrics(campaign, { orders, codes, redemptions, batches });
    return [
      campaign.id,
      campaign.title,
      campaign.organization,
      campaign.status,
      campaign.startAt,
      campaign.endAt,
      report.orderCount,
      (report.revenue / 100).toFixed(2),
      report.soldUnits,
      report.codeCount,
      report.redeemedCodeCount,
      report.claimRate,
      report.redemptionCount,
      report.pendingFulfillmentCount,
      report.batchCount,
      report.openBatchCount,
      (report.supportAmount / 100).toFixed(2),
      campaign.supportModel,
      campaign.supportRate
    ];
  });
  const csv = `${[headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
  const safeCampaign = campaignId ? `-${campaignId.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 100)}` : '';
  const filename = `izhe-campaign-report${safeCampaign}-${new Date().toISOString().slice(0, 10)}.csv`;
  return {
    response: new Response(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'no-store'
      }
    }),
    audit: {
      resourceType: 'campaign_report_export',
      resourceId: campaignId || 'all-campaigns',
      reason,
      afterSummary: { filename, campaignCount: rows.length, campaignId: campaignId || null, bounded: true }
    }
  };
});
