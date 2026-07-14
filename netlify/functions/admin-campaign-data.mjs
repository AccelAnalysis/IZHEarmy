import { requireAdmin } from './_shared/admin-auth.mjs';
import { loadCatalog } from './_shared/catalog-service.mjs';
import { computeCampaignMetrics } from './_shared/campaign-rules.mjs';
import { listCampaigns, listInquiries, listStoreJSON } from './_shared/campaign-service.mjs';
import { json, methodNotAllowed } from './_shared/http.mjs';

const newestFirst = (rows) => rows.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));

function campaignAlerts(inquiries, campaigns, reports, now = new Date()) {
  const alerts = [];
  const ageDays = (value) => (now - new Date(value || now)) / 86400000;
  for (const inquiry of inquiries) {
    if (inquiry.status === 'new' && ageDays(inquiry.createdAt) >= 2) alerts.push({ severity: 'warning', type: 'inquiry', recordId: inquiry.id, message: `${inquiry.organization} has waited at least two days for first contact.` });
    if (inquiry.followUpAt && new Date(inquiry.followUpAt) < now && !['completed', 'declined', 'converted'].includes(inquiry.status)) alerts.push({ severity: 'critical', type: 'inquiry', recordId: inquiry.id, message: `Follow-up is overdue for ${inquiry.organization}.` });
  }
  for (const campaign of campaigns) {
    const report = reports.find((item) => item.campaignId === campaign.id);
    if (campaign.status === 'active' && campaign.publishStatus !== 'published') alerts.push({ severity: 'critical', type: 'campaign', recordId: campaign.id, message: `${campaign.title} is active but its landing page is not published.` });
    if (campaign.status === 'scheduled' && campaign.startAt && new Date(campaign.startAt) < now) alerts.push({ severity: 'warning', type: 'campaign', recordId: campaign.id, message: `${campaign.title} has reached its start date but is still scheduled.` });
    if (campaign.status === 'active' && ageDays(campaign.startAt || campaign.createdAt) >= 7 && !report?.orderCount) alerts.push({ severity: 'info', type: 'campaign', recordId: campaign.id, message: `${campaign.title} has been active for at least seven days without an attributed order.` });
    if (campaign.status === 'closed' && report?.pendingFulfillmentCount) alerts.push({ severity: 'warning', type: 'campaign', recordId: campaign.id, message: `${campaign.title} is closed with ${report.pendingFulfillmentCount} gift fulfillments still open.` });
  }
  return alerts;
}

export default async (request) => {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const [{ catalog }, inquiries, campaigns, orders, codes, redemptions, batches] = await Promise.all([
      loadCatalog(),
      listInquiries(),
      listCampaigns(),
      listStoreJSON('izhe-orders'),
      listStoreJSON('izhe-give-codes'),
      listStoreJSON('izhe-redemptions'),
      listStoreJSON('izhe-production-batches')
    ]);
    const data = { orders, codes, redemptions, batches };
    const reports = campaigns.map((campaign) => ({ ...computeCampaignMetrics(campaign, data), campaign }));
    const summary = {
      inquiryCount: inquiries.length,
      openInquiryCount: inquiries.filter((item) => !['completed', 'declined', 'converted'].includes(item.status)).length,
      campaignCount: campaigns.length,
      activeCampaignCount: campaigns.filter((item) => item.status === 'active').length,
      totalCampaignRevenue: reports.reduce((sum, item) => sum + item.revenue, 0),
      totalMinistrySupport: reports.reduce((sum, item) => sum + item.supportAmount, 0),
      totalCampaignUnits: reports.reduce((sum, item) => sum + item.soldUnits, 0)
    };
    return json({
      inquiries: newestFirst(inquiries),
      campaigns: newestFirst(campaigns),
      reports: reports.sort((a, b) => new Date(b.campaign.updatedAt || 0) - new Date(a.campaign.updatedAt || 0)),
      alerts: campaignAlerts(inquiries, campaigns, reports),
      summary,
      catalog: {
        collections: catalog.collections,
        products: catalog.products.map(({ id, collectionId, name, shortName, audienceLabel, productType, status, availabilityStatus, images }) => ({ id, collectionId, name, shortName, audienceLabel, productType, status, availabilityStatus, images }))
      },
      generatedAt: new Date().toISOString()
    }, 200, { 'cache-control': 'no-store' });
  } catch (error) {
    console.error('admin-campaign-data', error);
    return json({ error: 'Campaign administration data could not be loaded.' }, 500);
  }
};
