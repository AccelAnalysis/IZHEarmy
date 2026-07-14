export const INQUIRY_STATUSES = [
  'new',
  'contacted',
  'discovery_scheduled',
  'plan_sent',
  'confirmed',
  'converted',
  'completed',
  'declined'
];

export const CAMPAIGN_STATUSES = [
  'planning',
  'scheduled',
  'active',
  'closed',
  'fulfilled',
  'cancelled'
];

export const CAMPAIGN_PUBLISH_STATUSES = ['draft', 'published', 'hidden', 'archived'];
export const CAMPAIGN_TYPES = ['church', 'conference', 'youth', 'outreach', 'ministry', 'event', 'other'];
export const CAMPAIGN_FULFILLMENT_METHODS = ['individual_shipping', 'church_batch', 'hybrid'];
export const SUPPORT_MODELS = ['percentage', 'per_unit', 'fixed'];

const clean = (value, max = 300) => String(value || '').trim().slice(0, max);
const cleanId = (value, max = 100) => clean(value, max).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/(^-|-$)/g, '');
const uniqueIds = (values, max = 500) => [...new Set((Array.isArray(values) ? values : []).map((value) => cleanId(value)).filter(Boolean))].slice(0, max);

export function createCampaignId(now = new Date(), random = Math.random()) {
  const date = now.toISOString().slice(0, 10).replaceAll('-', '');
  const suffix = Math.floor(random * 1679616).toString(36).toUpperCase().padStart(4, '0');
  return `CAM-${date}-${suffix}`;
}

export function createInquiryId(now = new Date(), random = Math.random()) {
  const date = now.toISOString().slice(0, 10).replaceAll('-', '');
  const suffix = Math.floor(random * 1679616).toString(36).toUpperCase().padStart(4, '0');
  return `INQ-${date}-${suffix}`;
}

export function validateInquiry(input, existing = null) {
  const organization = clean(input?.organization, 180);
  const contactName = clean(input?.contactName || input?.name, 160);
  const email = clean(input?.email, 254).toLowerCase();
  if (!organization || !contactName || !email) throw new Error('Organization, contact name, and email are required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
  const status = INQUIRY_STATUSES.includes(input?.status) ? input.status : existing?.status || 'new';
  const now = new Date().toISOString();
  return {
    id: existing?.id || clean(input?.id, 100) || createInquiryId(),
    organization,
    contactName,
    email,
    phone: clean(input?.phone, 40),
    attendance: clean(input?.attendance, 80),
    timeframe: clean(input?.timeframe, 160),
    ministryObjective: clean(input?.ministryObjective || input?.cause, 2000),
    eventType: clean(input?.eventType, 80) || 'church',
    preferredDate: clean(input?.preferredDate, 40),
    status,
    assignedTo: clean(input?.assignedTo, 120),
    followUpAt: input?.followUpAt ? new Date(input.followUpAt).toISOString() : '',
    notes: clean(input?.notes, 4000),
    linkedCampaignId: clean(input?.linkedCampaignId, 100),
    source: clean(input?.source, 80) || existing?.source || 'website',
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    statusHistory: status === existing?.status
      ? existing?.statusHistory || []
      : [...(existing?.statusHistory || []), { status, at: now, actor: existing ? 'admin' : 'website' }].slice(-100)
  };
}

export function validateCampaign(input, catalog, existing = null) {
  const id = existing?.id || clean(input?.id, 100) || createCampaignId();
  const title = clean(input?.title, 200);
  const organization = clean(input?.organization, 180);
  const slug = cleanId(input?.slug || title, 120);
  if (!title || !organization || !slug) throw new Error('Campaign title, organization, and URL slug are required.');
  const collectionIds = uniqueIds(input?.collectionIds);
  const productIds = uniqueIds(input?.productIds, 1000);
  const catalogCollections = new Set((catalog?.collections || []).map((item) => item.id));
  const catalogProducts = new Set((catalog?.products || []).map((item) => item.id));
  if (collectionIds.some((value) => !catalogCollections.has(value))) throw new Error('The campaign includes an unknown collection.');
  if (productIds.some((value) => !catalogProducts.has(value))) throw new Error('The campaign includes an unknown product.');
  if (!collectionIds.length && !productIds.length) throw new Error('Select at least one collection or product for the campaign.');
  const status = CAMPAIGN_STATUSES.includes(input?.status) ? input.status : 'planning';
  const publishStatus = CAMPAIGN_PUBLISH_STATUSES.includes(input?.publishStatus) ? input.publishStatus : 'draft';
  const campaignType = CAMPAIGN_TYPES.includes(input?.campaignType) ? input.campaignType : 'church';
  const fulfillmentMethod = CAMPAIGN_FULFILLMENT_METHODS.includes(input?.fulfillmentMethod) ? input.fulfillmentMethod : 'individual_shipping';
  const supportModel = SUPPORT_MODELS.includes(input?.supportModel) ? input.supportModel : 'percentage';
  const supportRate = Math.max(0, Math.min(supportModel === 'percentage' ? 100 : 10000000, Number(input?.supportRate || 0)));
  const now = new Date().toISOString();
  return {
    id,
    slug,
    title,
    organization,
    campaignType,
    status,
    publishStatus,
    inquiryId: clean(input?.inquiryId, 100),
    contactName: clean(input?.contactName, 160),
    contactEmail: clean(input?.contactEmail, 254).toLowerCase(),
    contactPhone: clean(input?.contactPhone, 40),
    ministryObjective: clean(input?.ministryObjective, 2500),
    publicHeadline: clean(input?.publicHeadline || title, 240),
    publicDescription: clean(input?.publicDescription, 4000),
    heroImage: clean(input?.heroImage, 1200),
    callToAction: clean(input?.callToAction, 180) || 'Support this ministry campaign',
    collectionIds,
    productIds,
    startAt: input?.startAt ? new Date(input.startAt).toISOString() : '',
    endAt: input?.endAt ? new Date(input.endAt).toISOString() : '',
    presentationAt: input?.presentationAt ? new Date(input.presentationAt).toISOString() : '',
    fulfillmentMethod,
    fulfillmentNotes: clean(input?.fulfillmentNotes, 2000),
    goalUnits: Math.max(0, Math.min(1000000, Number(input?.goalUnits || 0))),
    goalAmount: Math.max(0, Math.min(1000000000, Number(input?.goalAmount || 0))),
    supportModel,
    supportRate,
    supportLabel: clean(input?.supportLabel, 200) || 'Ministry support generated',
    notes: clean(input?.notes, 5000),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
}

export function campaignAllowsProduct(campaign, product) {
  if (!campaign || !product) return false;
  if ((campaign.productIds || []).includes(product.id)) return true;
  return (campaign.collectionIds || []).includes(product.collectionId);
}

export function campaignIsPublic(campaign) {
  if (!campaign || campaign.publishStatus !== 'published') return false;
  return ['scheduled', 'active', 'closed', 'fulfilled'].includes(campaign.status);
}

export function campaignIsPurchasable(campaign, now = new Date()) {
  if (!campaignIsPublic(campaign)) return false;
  if (!['scheduled', 'active'].includes(campaign.status)) return false;
  const start = campaign.startAt ? new Date(campaign.startAt) : null;
  const end = campaign.endAt ? new Date(campaign.endAt) : null;
  if (start && !Number.isNaN(start.valueOf()) && now < start) return false;
  if (end && !Number.isNaN(end.valueOf()) && now > end) return false;
  return true;
}

export function calculateSupportAmount(campaign, { revenue = 0, soldUnits = 0 } = {}) {
  if (!campaign) return 0;
  if (campaign.supportModel === 'per_unit') return Math.round(Number(campaign.supportRate || 0) * soldUnits);
  if (campaign.supportModel === 'fixed') return Math.round(Number(campaign.supportRate || 0));
  return Math.round(revenue * Number(campaign.supportRate || 0) / 100);
}

export function computeCampaignMetrics(campaign, { orders = [], codes = [], redemptions = [], batches = [] } = {}) {
  const campaignOrders = orders.filter((item) => item.campaignId === campaign.id);
  const eligibleOrders = campaignOrders.filter((item) => !['cancelled', 'refunded_or_disputed'].includes(item.status));
  const revenue = eligibleOrders.reduce((sum, order) => sum + (order.items || []).reduce((itemTotal, item) => itemTotal + Number(item.unitAmount || 0) * Number(item.quantity || 0), 0), 0);
  const grossCollected = eligibleOrders.reduce((sum, order) => sum + Number(order.amountTotal || 0), 0);
  const soldUnits = eligibleOrders.reduce((sum, order) => sum + (order.items || []).reduce((total, item) => total + Number(item.quantity || 0), 0), 0);
  const campaignCodes = codes.filter((item) => item.campaignId === campaign.id);
  const campaignRedemptions = redemptions.filter((item) => item.campaignId === campaign.id);
  const campaignBatches = batches.filter((item) => item.campaignId === campaign.id);
  const redeemedCodes = campaignCodes.filter((item) => item.status === 'redeemed').length;
  const supportAmount = calculateSupportAmount(campaign, { revenue, soldUnits });
  return {
    campaignId: campaign.id,
    orderCount: campaignOrders.length,
    revenue,
    grossCollected,
    soldUnits,
    codeCount: campaignCodes.length,
    redeemedCodeCount: redeemedCodes,
    claimRate: campaignCodes.length ? Math.round(redeemedCodes / campaignCodes.length * 1000) / 10 : 0,
    redemptionCount: campaignRedemptions.length,
    pendingFulfillmentCount: campaignRedemptions.filter((item) => !['fulfilled', 'cancelled'].includes(item.status)).length,
    batchCount: campaignBatches.length,
    openBatchCount: campaignBatches.filter((item) => !['completed', 'cancelled'].includes(item.status)).length,
    supportAmount,
    unitProgress: campaign.goalUnits ? Math.min(100, Math.round(soldUnits / campaign.goalUnits * 1000) / 10) : null,
    revenueProgress: campaign.goalAmount ? Math.min(100, Math.round(revenue / campaign.goalAmount * 1000) / 10) : null
  };
}
