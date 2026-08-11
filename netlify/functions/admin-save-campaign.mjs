import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import { hasPermission } from './_shared/admin-permissions.mjs';
import { readJsonBody } from './_shared/admin-request.mjs';
import { loadCatalog } from './_shared/catalog-service.mjs';
import { findCampaignById, saveCampaign } from './_shared/campaign-service.mjs';
import { json } from './_shared/http.mjs';

function requiresPublishPermission(existing, next) {
  if (!existing) return next?.publishStatus === 'published';
  return existing.publishStatus !== next?.publishStatus
    && (existing.publishStatus === 'published' || next?.publishStatus === 'published' || next?.publishStatus === 'archived');
}

export default adminEndpoint({
  methods: ['POST'],
  permission: 'campaigns.write',
  csrf: true,
  recentAuth: false,
  auditAction: 'campaign.save',
  rateClass: 'write',
  contentTypes: ['application/json'],
  maxBodyBytes: 1_000_000
}, async (request, context) => {
  const payload = await readJsonBody(request);
  const existing = payload.campaign?.id ? await findCampaignById(payload.campaign.id) : null;
  if (requiresPublishPermission(existing, payload.campaign) && !hasPermission(context.permissions, 'campaigns.publish')) {
    throw Object.assign(new Error('Publishing, unpublishing, or archiving a campaign requires publishing permission.'), { statusCode: 403 });
  }
  const { catalog } = await loadCatalog();
  const campaign = await saveCampaign(payload.campaign || {}, catalog, payload.expectedUpdatedAt || '');
  return {
    response: json({ campaign }, existing ? 200 : 201),
    audit: {
      resourceType: 'campaign',
      resourceId: campaign.id,
      beforeSummary: existing,
      afterSummary: campaign
    }
  };
});
