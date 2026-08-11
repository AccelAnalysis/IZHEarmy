import { loadCatalog, publicCatalog } from './_shared/catalog-service.mjs';
import { campaignAllowsProduct, campaignIsPublic, campaignIsPurchasable, computeCampaignMetrics } from './_shared/campaign-rules.mjs';
import { publicFulfillmentProjection } from './_shared/fulfillment-rules.mjs';
import { findCampaignBySlug, listStoreJSON } from './_shared/campaign-service.mjs';
import { listLedgerEntries } from './_shared/accountability-service.mjs';
import { campaignAccountability } from './_shared/accountability-rules.mjs';
import { json, methodNotAllowed } from './_shared/http.mjs';

function publicCampaignRecord(campaign) { return { id: campaign.id, slug: campaign.slug, title: campaign.title, organization: campaign.organization, campaignType: campaign.campaignType, status: campaign.status, publicHeadline: campaign.publicHeadline, publicDescription: campaign.publicDescription, ministryObjective: campaign.ministryObjective, heroImage: campaign.heroImage, callToAction: campaign.callToAction, startAt: campaign.startAt, endAt: campaign.endAt, presentationAt: campaign.presentationAt, fulfillmentMethod: campaign.fulfillmentMethod, goalUnits: campaign.goalUnits, goalAmount: campaign.goalAmount, supportLabel: campaign.supportLabel }; }
function publicCampaignMetrics(metrics, underReconciliation) {
  return {
    campaignId: metrics.campaignId,
    orderCount: metrics.orderCount,
    revenue: underReconciliation ? null : metrics.revenue,
    grossCollected: underReconciliation ? null : metrics.grossCollected,
    soldUnits: underReconciliation ? null : metrics.soldUnits,
    codeCount: metrics.codeCount,
    redeemedCodeCount: metrics.redeemedCodeCount,
    claimRate: metrics.claimRate,
    redemptionCount: metrics.redemptionCount,
    pendingFulfillmentCount: metrics.pendingFulfillmentCount,
    batchCount: metrics.batchCount,
    openBatchCount: metrics.openBatchCount,
    supportAmount: underReconciliation ? null : metrics.supportAmount,
    unitProgress: underReconciliation ? null : metrics.unitProgress,
    revenueProgress: underReconciliation ? null : metrics.revenueProgress,
    figuresUnderReconciliation: underReconciliation
  };
}

export default async (request) => {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  try {
    const slug = new URL(request.url).searchParams.get('slug') || ''; const campaign = await findCampaignBySlug(slug);
    if (!campaign || !campaignIsPublic(campaign)) return json({ error: 'This campaign is not available.' }, 404);
    const [{ catalog }, orders, codes, obligations, redemptions, batches, ledger, reconciliationTasks, stripeEvents, workflows] = await Promise.all([
      loadCatalog(),
      listStoreJSON('izhe-orders', 10000),
      listStoreJSON('izhe-give-codes', 10000),
      listStoreJSON('izhe-give-obligations', 10000),
      listStoreJSON('izhe-redemptions', 10000),
      listStoreJSON('izhe-production-batches', 10000),
      listLedgerEntries(),
      listStoreJSON('izhe-reconciliation-tasks', 10000),
      listStoreJSON('izhe-stripe-events', 10000),
      listStoreJSON('izhe-order-workflows', 10000)
    ]);
    const liveCatalog = publicCatalog(catalog); const collectionIds = new Set(campaign.collectionIds || []); const purchasable = campaignIsPurchasable(campaign);
    const products = liveCatalog.products.filter((product) => campaignAllowsProduct(campaign, product)).map((product) => ({ ...product, isPurchasable: product.isPurchasable && purchasable }));
    const productCollectionIds = new Set(products.map((product) => product.collectionId)); const collections = liveCatalog.collections.filter((collection) => collectionIds.has(collection.id) || productCollectionIds.has(collection.id));
    const records = { orders, codes, obligations, redemptions, batches, reconciliationTasks, stripeEvents, workflows };
    const metrics = computeCampaignMetrics(campaign, records); const statement = campaignAccountability(campaign, records, ledger);
    const underReconciliation = Boolean(statement.underReconciliation);
    const publicAccountability = {
      figuresUnderReconciliation: underReconciliation,
      reconciliationMessage: underReconciliation ? 'Figures are under reconciliation while payment activity is reviewed.' : '',
      netEligibleMerchandiseActivity: underReconciliation ? null : statement.netRecognizedMerchandiseRevenue,
      supportCalculated: underReconciliation ? null : statement.supportCalculated,
      supportAccrued: underReconciliation ? null : statement.supportAccrued,
      supportPaid: statement.supportPaid,
      supportOutstanding: underReconciliation ? null : statement.supportOutstanding,
      giftsFulfilled: statement.fulfilledGifts,
      openGiftObligations: statement.activeGiftObligations + statement.suspendedGiftObligations + statement.pendingGiftFulfillment,
      // Backward-compatible public names; unresolved figures are intentionally null rather than false precision.
      merchandiseRevenue: underReconciliation ? null : statement.netRecognizedMerchandiseRevenue,
      fulfilledGifts: statement.fulfilledGifts,
      pendingGiftFulfillment: statement.pendingGiftFulfillment,
      activeGiftObligations: statement.activeGiftObligations,
      suspendedGiftObligations: statement.suspendedGiftObligations
    };
    return json({ campaign: publicCampaignRecord(campaign), fulfillment: publicFulfillmentProjection(campaign), purchasable, collections, products, metrics: publicCampaignMetrics(metrics, underReconciliation), accountability: publicAccountability, qrUrl: `/.netlify/functions/campaign-qr?slug=${encodeURIComponent(campaign.slug)}` }, 200, { 'cache-control': 'public, max-age=30, stale-while-revalidate=120' });
  } catch (error) { console.error('public-campaign', String(error?.message || error).slice(0, 500)); return json({ error: 'The campaign could not be loaded.' }, 500); }
};
