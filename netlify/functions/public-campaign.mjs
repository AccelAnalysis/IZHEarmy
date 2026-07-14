import { loadCatalog, publicCatalog } from './_shared/catalog-service.mjs';
import { campaignAllowsProduct, campaignIsPublic, campaignIsPurchasable, computeCampaignMetrics } from './_shared/campaign-rules.mjs';
import { findCampaignBySlug, listStoreJSON } from './_shared/campaign-service.mjs';
import { listLedgerEntries } from './_shared/accountability-service.mjs';
import { campaignAccountability } from './_shared/accountability-rules.mjs';
import { json, methodNotAllowed } from './_shared/http.mjs';

function publicCampaignRecord(campaign) {
  return {
    id: campaign.id,
    slug: campaign.slug,
    title: campaign.title,
    organization: campaign.organization,
    campaignType: campaign.campaignType,
    status: campaign.status,
    publicHeadline: campaign.publicHeadline,
    publicDescription: campaign.publicDescription,
    ministryObjective: campaign.ministryObjective,
    heroImage: campaign.heroImage,
    callToAction: campaign.callToAction,
    startAt: campaign.startAt,
    endAt: campaign.endAt,
    presentationAt: campaign.presentationAt,
    fulfillmentMethod: campaign.fulfillmentMethod,
    goalUnits: campaign.goalUnits,
    goalAmount: campaign.goalAmount,
    supportLabel: campaign.supportLabel,
    supportModel: campaign.supportModel,
    supportRate: campaign.supportRate
  };
}

export default async (request) => {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  try {
    const slug = new URL(request.url).searchParams.get('slug') || '';
    const campaign = await findCampaignBySlug(slug);
    if (!campaign || !campaignIsPublic(campaign)) return json({ error: 'This campaign is not available.' }, 404);
    const [{ catalog }, orders, codes, redemptions, batches, ledger] = await Promise.all([
      loadCatalog(),
      listStoreJSON('izhe-orders'),
      listStoreJSON('izhe-give-codes'),
      listStoreJSON('izhe-redemptions'),
      listStoreJSON('izhe-production-batches'),
      listLedgerEntries()
    ]);
    const liveCatalog = publicCatalog(catalog);
    const collectionIds = new Set(campaign.collectionIds || []);
    const products = liveCatalog.products
      .filter((product) => campaignAllowsProduct(campaign, product))
      .map((product) => ({ ...product, isPurchasable: product.isPurchasable && campaignIsPurchasable(campaign) }));
    const productCollectionIds = new Set(products.map((product) => product.collectionId));
    const collections = liveCatalog.collections.filter((collection) => collectionIds.has(collection.id) || productCollectionIds.has(collection.id));
    const records = { orders, codes, redemptions, batches };
    const metrics = computeCampaignMetrics(campaign, records);
    const statement = campaignAccountability(campaign, records, ledger);
    return json({
      campaign: publicCampaignRecord(campaign),
      purchasable: campaignIsPurchasable(campaign),
      collections,
      products,
      metrics,
      accountability: {
        merchandiseRevenue: statement.merchandiseRevenue,
        supportAccrued: statement.supportAccrued,
        supportPaid: statement.supportPaid,
        supportOutstanding: statement.supportOutstanding,
        giveCodesIssued: statement.giveCodesIssued,
        fulfilledGifts: statement.fulfilledGifts,
        pendingGiftFulfillment: statement.pendingGiftFulfillment,
        activeGiftObligations: statement.activeGiftObligations
      },
      qrUrl: `/.netlify/functions/campaign-qr?slug=${encodeURIComponent(campaign.slug)}`
    }, 200, { 'cache-control': 'public, max-age=30, stale-while-revalidate=120' });
  } catch (error) {
    console.error('public-campaign', error);
    return json({ error: 'The campaign could not be loaded.' }, 500);
  }
};
