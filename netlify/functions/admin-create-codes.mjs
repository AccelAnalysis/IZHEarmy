import { getStore } from '@netlify/blobs';
import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import { readJsonBody, requiredExplanation } from './_shared/admin-request.mjs';
import { loadCatalog, primaryImage } from './_shared/catalog-service.mjs';
import { campaignAllowsProduct } from './_shared/campaign-rules.mjs';
import { findCampaignById } from './_shared/campaign-service.mjs';
import { createGiveCode } from './_shared/codes.mjs';
import { json, cleanText } from './_shared/http.mjs';

export default adminEndpoint({
  methods: ['POST'],
  permission: 'operations.give_one.write',
  csrf: true,
  recentAuth: true,
  auditAction: 'give_one.codes.create',
  rateClass: 'bulk',
  contentTypes: ['application/json'],
  maxBodyBytes: 100_000
}, async (request, context) => {
  const payload = await readJsonBody(request);
  const { catalog } = await loadCatalog();
  const product = catalog.products.find((candidate) => candidate.id === cleanText(payload.productId, 80));
  const count = Number(payload.count || 1);
  const orderRef = cleanText(payload.orderRef, 100) || 'manual';
  const campaignId = cleanText(payload.campaignId, 100);
  const campaign = campaignId ? await findCampaignById(campaignId) : null;
  if (campaignId && !campaign) throw Object.assign(new Error('The selected campaign was not found.'), { statusCode: 404 });
  if (!product || !product.giveOneEligible) throw Object.assign(new Error('Select a Give One eligible product.'), { statusCode: 400 });
  if (campaign && !campaignAllowsProduct(campaign, product)) throw Object.assign(new Error('This product is not assigned to the selected campaign.'), { statusCode: 400 });
  if (!Number.isInteger(count) || count < 1 || count > 50) throw Object.assign(new Error('Count must be between 1 and 50.'), { statusCode: 400 });
  let reason = cleanText(payload.reason, 1000);
  if (count >= 10) {
    reason = requiredExplanation(reason);
    if (payload.confirmBulkCreation !== true) {
      throw Object.assign(new Error('Explicit confirmation is required to create ten or more Give One codes.'), { statusCode: 400 });
    }
  }

  const store = getStore('izhe-give-codes');
  const created = [];
  const eligibleVariants = (product.variants || []).filter((variant) => variant.status !== 'disabled' && variant.availabilityStatus !== 'retired');
  for (let i = 0; i < count; i += 1) {
    let saved = false;
    for (let attempt = 0; attempt < 8 && !saved; attempt += 1) {
      const code = createGiveCode();
      const record = {
        code,
        status: 'active',
        productId: product.id,
        productName: product.name,
        productSnapshot: {
          id: product.id,
          name: product.name,
          shortName: product.shortName,
          collectionId: product.collectionId,
          productType: product.productType,
          image: primaryImage(product)?.url || '',
          variants: eligibleVariants.map(({ id, fit, size, color, sku }) => ({ id, fit, size, color, sku }))
        },
        campaignId: campaign?.id || '',
        campaignSlug: campaign?.slug || '',
        campaign: campaign ? {
          id: campaign.id,
          slug: campaign.slug,
          title: campaign.title,
          organization: campaign.organization,
          ministryObjective: campaign.ministryObjective,
          fulfillmentMethod: campaign.fulfillmentMethod,
          supportModel: campaign.supportModel,
          supportRate: campaign.supportRate
        } : null,
        sourceSessionId: orderRef,
        purchaserEmail: '',
        createdAt: new Date().toISOString(),
        createdByAdministratorId: context.userId,
        redeemedAt: null,
        redemptionId: null,
        cancelledAt: null,
        cancellationReason: null
      };
      const result = await store.setJSON(code, record, { onlyIfNew: true });
      if (result.modified) { created.push(record); saved = true; }
    }
    if (!saved) throw new Error('Could not generate all requested codes.');
  }
  return {
    response: json({ created }),
    audit: {
      resourceType: 'give_one_code_batch',
      resourceId: `manual:${orderRef}:${Date.now()}`,
      reason,
      afterSummary: { count: created.length, productId: product.id, campaignId, bulkConfirmed: count >= 10 }
    }
  };
});
