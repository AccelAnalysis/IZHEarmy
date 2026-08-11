import { CAMPAIGN_FULFILLMENT_METHODS, churchBatchReadiness, emptyChurchBatch, normalizeChurchBatch } from './fulfillment-rules.mjs';
import { cents, normalizeLegacyPayment, supportForOrder } from './payment-rules.mjs';

export const INQUIRY_STATUSES = ['new','contacted','discovery_scheduled','plan_sent','confirmed','converted','completed','declined'];
export const CAMPAIGN_STATUSES = ['planning', 'scheduled', 'active', 'closed', 'fulfilled', 'cancelled'];
export const CAMPAIGN_PUBLISH_STATUSES = ['draft', 'published', 'hidden', 'archived'];
export const CAMPAIGN_TYPES = ['church', 'conference', 'youth', 'outreach', 'ministry', 'event', 'other'];
export { CAMPAIGN_FULFILLMENT_METHODS };
export const SUPPORT_MODELS = ['percentage', 'per_unit', 'fixed'];

const clean = (value, max = 300) => String(value || '').trim().slice(0, max);
const cleanId = (value, max = 100) => clean(value, max).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/(^-|-$)/g, '');
const uniqueIds = (values, max = 500) => [...new Set((Array.isArray(values) ? values : []).map((value) => cleanId(value)).filter(Boolean))].slice(0, max);

function requiredIso(value, label) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) throw new Error(`${label} must be a valid date.`);
  return date.toISOString();
}

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
  return { id: existing?.id || clean(input?.id, 100) || createInquiryId(), organization, contactName, email, phone: clean(input?.phone, 40), attendance: clean(input?.attendance, 80), timeframe: clean(input?.timeframe, 160), ministryObjective: clean(input?.ministryObjective || input?.cause, 2000), eventType: clean(input?.eventType, 80) || 'church', preferredDate: clean(input?.preferredDate, 40), status, assignedTo: clean(input?.assignedTo, 120), followUpAt: input?.followUpAt ? requiredIso(input.followUpAt, 'Follow-up date') : '', notes: clean(input?.notes, 4000), linkedCampaignId: clean(input?.linkedCampaignId, 100), source: clean(input?.source, 80) || existing?.source || 'website', createdAt: existing?.createdAt || now, updatedAt: now, statusHistory: status === existing?.status ? existing?.statusHistory || [] : [...(existing?.statusHistory || []), { status, at: now, actor: existing ? 'admin' : 'website' }].slice(-100) };
}

export function validateCampaign(input, catalog, existing = null) {
  const id = existing?.id || clean(input?.id, 100) || createCampaignId();
  const title = clean(input?.title, 200); const organization = clean(input?.organization, 180); const slug = cleanId(input?.slug || title, 120);
  if (!title || !organization || !slug) throw new Error('Campaign title, organization, and URL slug are required.');
  const collectionIds = uniqueIds(input?.collectionIds); const productIds = uniqueIds(input?.productIds, 1000);
  const catalogCollections = new Set((catalog?.collections || []).map((item) => item.id)); const catalogProducts = new Set((catalog?.products || []).map((item) => item.id));
  if (collectionIds.some((value) => !catalogCollections.has(value))) throw new Error('The campaign includes an unknown collection.');
  if (productIds.some((value) => !catalogProducts.has(value))) throw new Error('The campaign includes an unknown product.');
  if (!collectionIds.length && !productIds.length) throw new Error('Select at least one collection or product for the campaign.');
  const status = CAMPAIGN_STATUSES.includes(input?.status) ? input.status : 'planning';
  const publishStatus = CAMPAIGN_PUBLISH_STATUSES.includes(input?.publishStatus) ? input.publishStatus : 'draft';
  const campaignType = CAMPAIGN_TYPES.includes(input?.campaignType) ? input.campaignType : 'church';
  const fulfillmentMethod = CAMPAIGN_FULFILLMENT_METHODS.includes(input?.fulfillmentMethod) ? input.fulfillmentMethod : 'individual_shipping';
  const supportModel = SUPPORT_MODELS.includes(input?.supportModel) ? input.supportModel : 'percentage';
  const supportRate = Math.max(0, Math.min(supportModel === 'percentage' ? 100 : 10000000, Number(input?.supportRate || 0)));
  const startAt = requiredIso(input?.startAt, 'Ordering start'); const endAt = requiredIso(input?.endAt, 'Ordering end');
  if (startAt && endAt && new Date(endAt) <= new Date(startAt)) throw new Error('Ordering end must be later than ordering start.');
  const presentationAt = requiredIso(input?.presentationAt, 'Presentation date');
  const { value: churchBatch, errors: churchBatchErrors } = normalizeChurchBatch(input?.churchBatch || existing?.churchBatch || emptyChurchBatch(), { startAt, endAt });
  const readiness = churchBatchReadiness({ fulfillmentMethod, churchBatch, startAt, endAt });
  const activePublished = publishStatus === 'published' && ['scheduled', 'active'].includes(status);
  if (fulfillmentMethod !== 'individual_shipping' && churchBatchErrors.length) throw new Error(churchBatchErrors[0]);
  if (activePublished && !readiness.complete) throw new Error(`Campaign cannot accept church-pickup orders until completed: ${readiness.errors.join(' ')}`);
  const now = new Date().toISOString();
  return { id, slug, title, organization, campaignType, status, publishStatus, inquiryId: clean(input?.inquiryId, 100), contactName: clean(input?.contactName, 160), contactEmail: clean(input?.contactEmail, 254).toLowerCase(), contactPhone: clean(input?.contactPhone, 40), ministryObjective: clean(input?.ministryObjective, 2500), publicHeadline: clean(input?.publicHeadline || title, 240), publicDescription: clean(input?.publicDescription, 4000), heroImage: clean(input?.heroImage, 1200), callToAction: clean(input?.callToAction, 180) || 'Support this ministry campaign', collectionIds, productIds, startAt, endAt, presentationAt, fulfillmentMethod, churchBatch, fulfillmentNotes: clean(input?.fulfillmentNotes, 2000), goalUnits: Math.max(0, Math.min(1000000, Number(input?.goalUnits || 0))), goalAmount: Math.max(0, Math.min(1000000000, Number(input?.goalAmount || 0))), supportModel, supportRate, supportLabel: clean(input?.supportLabel, 200) || 'Ministry support generated', notes: clean(input?.notes, 5000), createdAt: existing?.createdAt || now, updatedAt: now };
}

export function campaignAllowsProduct(campaign, product) {
  if (!campaign || !product) return false;
  if ((campaign.productIds || []).includes(product.id)) return true;
  return (campaign.collectionIds || []).includes(product.collectionId);
}
export function campaignIsPublic(campaign) { return Boolean(campaign && campaign.publishStatus === 'published' && ['scheduled', 'active', 'closed', 'fulfilled'].includes(campaign.status)); }
export function campaignIsPurchasable(campaign, now = new Date()) {
  if (!campaignIsPublic(campaign) || !['scheduled', 'active'].includes(campaign.status) || !churchBatchReadiness(campaign).complete) return false;
  const start = campaign.startAt ? new Date(campaign.startAt) : null; const end = campaign.endAt ? new Date(campaign.endAt) : null;
  if (start && !Number.isNaN(start.valueOf()) && now < start) return false;
  if (end && !Number.isNaN(end.valueOf()) && now > end) return false;
  return true;
}
export function calculateSupportAmount(campaign, { revenue = 0, soldUnits = 0, qualifyingActivity = false } = {}) {
  if (!campaign) return 0;
  if (campaign.supportModel === 'per_unit') return Math.round(Number(campaign.supportRate || 0) * soldUnits);
  if (campaign.supportModel === 'fixed') return qualifyingActivity ? Math.round(Number(campaign.supportRate || 0)) : 0;
  return Math.round(revenue * Number(campaign.supportRate || 0) / 100);
}
const orderUnits = (order) => (order.lineSettlements || order.items || []).reduce((total, item) => total + Number(item.quantityPurchased ?? item.quantity ?? 0), 0);
const assignmentUnits = (order, predicate = () => true) => (order.batchAssignments || []).filter(predicate).reduce((sum, assignment) => sum + Number(assignment.quantity || 0), 0);

function recognizedMerchandise(order) {
  if (Array.isArray(order.lineSettlements) && order.lineSettlements.length) return order.lineSettlements.reduce((sum, line) => sum + Math.max(0, cents(line.netRecognizedMerchandiseRevenue)), 0);
  const payment = order.payment || normalizeLegacyPayment(order);
  return Math.max(0, cents(payment.amounts?.merchandiseNetBeforeRefunds) - cents(payment.amounts?.merchandiseRefunded));
}

function settledUnits(order) {
  if (!Array.isArray(order.lineSettlements) || !order.lineSettlements.length) return orderUnits(order);
  return order.lineSettlements.reduce((sum, line) => sum + Math.max(0, cents(line.quantityPurchased) - (line.allocatedWholeUnitReversals || []).length), 0);
}

export function aggregateCampaignSupport(orders = []) {
  const projections = orders.map((order) => ({ order, support: supportForOrder(order) }));
  let calculated = 0;
  let held = 0;
  const fixedByPolicy = new Map();
  let legacyUnreconciled = 0;
  for (const { order, support } of projections) {
    if (!order.supportPolicy) {
      legacyUnreconciled += 1;
      continue;
    }
    if (order.supportPolicy.supportModel === 'fixed') {
      const key = support.policyVersion || order.supportPolicy.policyVersion || 'fixed-unversioned';
      const current = fixedByPolicy.get(key) || { rate: Math.round(Number(order.supportPolicy.supportRate || 0)), qualifyingClear: false, qualifyingHeld: false };
      if (support.qualifying && support.calculated > 0) {
        if (support.held > 0) current.qualifyingHeld = true;
        else current.qualifyingClear = true;
      }
      fixedByPolicy.set(key, current);
      continue;
    }
    calculated += support.calculated;
    held += support.held;
  }
  for (const value of fixedByPolicy.values()) {
    if (!value.qualifyingClear && !value.qualifyingHeld) continue;
    calculated += value.rate;
    if (!value.qualifyingClear && value.qualifyingHeld) held += value.rate;
  }
  return { calculated, held: Math.min(calculated, held), legacyUnreconciled };
}

export function computeCampaignMetrics(campaign, { orders = [], codes = [], obligations = [], redemptions = [], batches = [] } = {}) {
  const campaignOrders = orders.filter((item) => item.campaignId === campaign.id);
  const capturedOrders = campaignOrders.filter((item) => (item.payment?.captureStatus || (item.paymentStatus === 'paid' ? 'paid' : 'pending')) === 'paid');
  const revenue = capturedOrders.reduce((sum, order) => sum + recognizedMerchandise(order), 0);
  const grossCollected = capturedOrders.reduce((sum, order) => sum + Math.max(0, cents((order.payment || normalizeLegacyPayment(order)).amounts?.totalCharged)), 0);
  const soldUnits = capturedOrders.reduce((sum, order) => sum + settledUnits(order), 0);
  const campaignCodes = codes.filter((item) => item.campaignId === campaign.id); const campaignObligations = obligations.filter((item) => item.campaignId === campaign.id); const campaignRedemptions = redemptions.filter((item) => item.campaignId === campaign.id); const campaignBatches = batches.filter((item) => item.campaignId === campaign.id);
  const redeemedCodes = (campaignObligations.length ? campaignObligations : campaignCodes).filter((item) => ['redeemed', 'in_fulfillment', 'fulfilled'].includes(item.status)).length;
  const obligationCount = campaignObligations.length || campaignCodes.length;
  const support = aggregateCampaignSupport(capturedOrders);
  const activePickupOrders = campaignOrders.filter((order) => order.fulfillment?.mode === 'church_batch' && !['cancelled'].includes(order.status) && (order.payment?.captureStatus || order.paymentStatus) === 'paid');
  const pickupUnits = activePickupOrders.reduce((sum, order) => sum + settledUnits(order), 0);
  const batchedUnits = activePickupOrders.reduce((sum, order) => sum + Math.min(settledUnits(order), assignmentUnits(order, (assignment) => assignment.batchStatus !== 'cancelled')), 0);
  return {
    campaignId: campaign.id,
    orderCount: campaignOrders.length,
    revenue,
    grossCollected,
    soldUnits,
    codeCount: obligationCount,
    redeemedCodeCount: redeemedCodes,
    claimRate: obligationCount ? Math.round(redeemedCodes / obligationCount * 1000) / 10 : 0,
    redemptionCount: campaignRedemptions.length,
    pendingFulfillmentCount: campaignRedemptions.filter((item) => !['fulfilled', 'cancelled'].includes(item.status)).length,
    batchCount: campaignBatches.length,
    openBatchCount: campaignBatches.filter((item) => !['completed', 'cancelled'].includes(item.status)).length,
    supportAmount: support.calculated,
    supportHeld: support.held,
    reconciliationRequired: support.legacyUnreconciled > 0 || campaignOrders.some((order) => !['reconciled', 'legacy_reconciled'].includes((order.payment || normalizeLegacyPayment(order)).reconciliationStatus)),
    unitProgress: campaign.goalUnits ? Math.min(100, Math.round(soldUnits / campaign.goalUnits * 1000) / 10) : null,
    revenueProgress: campaign.goalAmount ? Math.min(100, Math.round(revenue / campaign.goalAmount * 1000) / 10) : null,
    churchPickupOrderCount: activePickupOrders.length,
    churchPickupUnitCount: pickupUnits,
    unbatchedChurchPickupUnits: Math.max(0, pickupUnits - batchedUnits),
    batchedChurchPickupUnits: batchedUnits,
    churchPickupUnitsInProduction: activePickupOrders.reduce((sum, order) => sum + assignmentUnits(order, (assignment) => assignment.batchStatus === 'in_production'), 0),
    readyForPickupOrderCount: activePickupOrders.filter((order) => order.fulfillment?.status === 'ready_for_pickup' || order.status === 'ready_for_pickup').length,
    pickedUpOrderCount: activePickupOrders.filter((order) => order.fulfillment?.status === 'picked_up').length,
    pickupExceptionCount: activePickupOrders.filter((order) => ['exception', 'no_show'].includes(order.fulfillment?.status) || order.status === 'exception').length,
    directShippingOrderCount: campaignOrders.filter((order) => order.fulfillment?.mode !== 'church_batch' && (order.payment?.captureStatus || order.paymentStatus) === 'paid').length
  };
}
