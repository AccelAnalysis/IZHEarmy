import { getStore } from '@netlify/blobs';
import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import { readJsonBody, requiredExplanation } from './_shared/admin-request.mjs';
import { findCampaignById } from './_shared/campaign-service.mjs';
import { appendStatusHistory, BATCH_STATUSES, batchProductionSummary, createBatchId } from './_shared/operations-rules.mjs';
import { pickupDestinationSnapshot } from './_shared/church-batch-rules.mjs';
import { syncBatchSources } from './_shared/batch-sync.mjs';
import { cleanText, json } from './_shared/http.mjs';

function cleanItems(items) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  return items.slice(0, 1000).map((item) => {
    const sourceType = item?.sourceType === 'redemption' ? 'redemption' : 'order';
    const sourceId = cleanText(item?.sourceId, 180);
    const sourceItemId = cleanText(item?.sourceItemId, 220) || `${sourceType}:${sourceId}`;
    if (!sourceId || seen.has(sourceItemId)) return null;
    seen.add(sourceItemId);
    return {
      sourceType,
      sourceId,
      sourceItemId,
      itemIndex: Number.isInteger(Number(item?.itemIndex)) ? Number(item.itemIndex) : null,
      productId: cleanText(item?.productId, 100),
      productName: cleanText(item?.productName, 240),
      variantId: cleanText(item?.variantId, 100),
      fit: cleanText(item?.fit, 60),
      size: cleanText(item?.size, 24),
      color: cleanText(item?.color, 80),
      sku: cleanText(item?.sku, 160),
      variantSku: cleanText(item?.variantSku, 160),
      campaignId: cleanText(item?.campaignId, 100),
      quantity: Math.max(1, Math.min(1000, Number(item?.quantity || 1)))
    };
  }).filter(Boolean);
}

function itemSetSignature(items) {
  return cleanItems(items)
    .map((item) => [item.sourceType, item.sourceId, item.sourceItemId, item.itemIndex, item.productId, item.variantId, item.fit, item.size, item.color, item.sku, item.variantSku, item.campaignId, item.quantity].join('|'))
    .sort()
    .join('\n');
}

export default adminEndpoint({
  methods: ['POST'],
  permission: 'operations.batches.write',
  csrf: true,
  recentAuth: false,
  auditAction: 'batch.save',
  rateClass: 'write',
  contentTypes: ['application/json'],
  maxBodyBytes: 1_000_000
}, async (request, context) => {
  const payload = await readJsonBody(request);
  const input = payload.batch || {};
  const id = cleanText(input.id, 100) || createBatchId();
  const name = cleanText(input.name, 180) || id;
  const status = cleanText(input.status, 40) || 'draft';
  const requestedCampaignId = cleanText(input.campaignId, 100);
  const requestedBatchTypeValue = cleanText(input.batchType, 60);
  const requestedBatchType = requestedBatchTypeValue || 'manual';
  if (!BATCH_STATUSES.includes(status)) throw Object.assign(new Error('Invalid production batch status.'), { statusCode: 400 });

  const store = getStore('izhe-production-batches');
  const entry = await store.getWithMetadata(id, { type: 'json', consistency: 'strong' });
  if (payload.expectedUpdatedAt && entry?.data?.updatedAt !== payload.expectedUpdatedAt) {
    throw Object.assign(new Error('This production batch changed in another session. Reload before saving.'), { statusCode: 409 });
  }

  const existingChurchPickup = entry?.data?.batchType === 'campaign_church_pickup';
  let batchType = requestedBatchType;
  let campaignId = requestedCampaignId;
  if (existingChurchPickup) {
    if (requestedBatchTypeValue && requestedBatchTypeValue !== 'campaign_church_pickup') {
      throw Object.assign(new Error('The batch type cannot be changed after a church-pickup batch is created.'), { statusCode: 400 });
    }
    if (requestedCampaignId && requestedCampaignId !== entry.data.campaignId) {
      throw Object.assign(new Error('The campaign cannot be changed on an existing church-pickup batch.'), { statusCode: 400 });
    }
    batchType = 'campaign_church_pickup';
    campaignId = entry.data.campaignId || requestedCampaignId;
  }
  if (batchType === 'campaign_church_pickup' && !existingChurchPickup) {
    throw Object.assign(new Error('Create church-pickup batches with Build or Refresh Church Pickup Batch so eligibility and allocation rules are enforced.'), { statusCode: 400 });
  }

  const campaign = campaignId ? await findCampaignById(campaignId) : null;
  if (campaignId && !campaign && !existingChurchPickup) throw Object.assign(new Error('The selected campaign was not found.'), { statusCode: 404 });

  let items = cleanItems(input.items);
  if (campaignId && items.some((item) => item.campaignId !== campaignId)) {
    throw Object.assign(new Error('A campaign production batch can contain only fulfillment units attributed to that campaign.'), { statusCode: 400 });
  }
  if (existingChurchPickup) {
    const existingItems = cleanItems(entry.data.items || []);
    if (Array.isArray(input.items) && itemSetSignature(input.items) !== itemSetSignature(existingItems)) {
      throw Object.assign(new Error('Church-pickup batch items are managed only through Build or Refresh Church Pickup Batch. Submitted production obligations cannot be edited silently.'), { statusCode: 409 });
    }
    items = existingItems;
    if (items.some((item) => item.sourceType !== 'order')) {
      throw Object.assign(new Error('Church-pickup batches contain paid order items only. Give One redemptions remain separate.'), { statusCode: 400 });
    }
  }

  let note = cleanText(payload.note, 1_000);
  if (status === 'cancelled' && status !== entry?.data?.status) note = requiredExplanation(note);
  const now = new Date().toISOString();
  const destination = existingChurchPickup ? (entry.data.destination || pickupDestinationSnapshot(campaign)) : input.destination || entry?.data?.destination || null;
  const batch = {
    id,
    name,
    batchType,
    vendor: cleanText(input.vendor, 180),
    campaignId,
    campaignTitle: entry?.data?.campaignTitle || campaign?.title || '',
    campaignOrganization: entry?.data?.campaignOrganization || campaign?.organization || '',
    destination,
    status,
    dueDate: input.dueDate ? new Date(input.dueDate).toISOString() : entry?.data?.dueDate || '',
    submittedAt: status === 'submitted' && !entry?.data?.submittedAt ? now : entry?.data?.submittedAt || '',
    receivedAt: ['received', 'completed'].includes(status) && !entry?.data?.receivedAt ? now : entry?.data?.receivedAt || '',
    receivedBy: cleanText(input.receivedBy || entry?.data?.receivedBy, 160),
    completedAt: status === 'completed' ? (entry?.data?.completedAt || now) : entry?.data?.completedAt || '',
    tracking: cleanText(input.tracking || entry?.data?.tracking, 180),
    vendorToChurchTracking: cleanText(input.vendorToChurchTracking || input.tracking || entry?.data?.vendorToChurchTracking, 180),
    notes: cleanText(input.notes || entry?.data?.notes, 3000),
    items,
    productionSummary: batchProductionSummary(items),
    itemCount: items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    createdAt: entry?.data?.createdAt || now,
    updatedAt: now,
    lastAdministrativeActorId: context.userId,
    statusHistory: appendStatusHistory(entry?.data || {}, status, note, `admin:${context.userId}`)
  };
  const result = entry
    ? await store.setJSON(id, batch, { onlyIfMatch: entry.etag })
    : await store.setJSON(id, batch, { onlyIfNew: true });
  if (!result.modified) {
    throw Object.assign(new Error('The production batch could not be saved because it changed in another session.'), { statusCode: 409 });
  }
  await syncBatchSources(entry?.data?.items || [], items, batch);
  return {
    response: json({ batch }, entry ? 200 : 201),
    audit: {
      resourceType: 'production_batch',
      resourceId: batch.id,
      reason: note,
      beforeSummary: entry?.data ? { status: entry.data.status, itemCount: entry.data.itemCount, campaignId: entry.data.campaignId } : null,
      afterSummary: { status: batch.status, itemCount: batch.itemCount, campaignId: batch.campaignId, batchType: batch.batchType }
    }
  };
});
