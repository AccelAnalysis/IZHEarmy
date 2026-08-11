import { getStore } from '@netlify/blobs';
import { requireAdmin } from './_shared/admin-auth.mjs';
import { findCampaignById } from './_shared/campaign-service.mjs';
import { appendStatusHistory, BATCH_STATUSES, batchProductionSummary, createBatchId } from './_shared/operations-rules.mjs';
import { churchBatchReadiness } from './_shared/fulfillment-rules.mjs';
import { pickupDestinationSnapshot } from './_shared/church-batch-rules.mjs';
import { syncBatchSources } from './_shared/batch-sync.mjs';
import { cleanText, json, methodNotAllowed } from './_shared/http.mjs';

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

export default async (request) => {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const payload = await request.json();
    const input = payload.batch || {};
    const id = cleanText(input.id, 100) || createBatchId();
    const name = cleanText(input.name, 180) || id;
    const status = cleanText(input.status, 40) || 'draft';
    const campaignId = cleanText(input.campaignId, 100);
    const batchType = cleanText(input.batchType, 60) || 'manual';
    if (!BATCH_STATUSES.includes(status)) return json({ error: 'Invalid production batch status.' }, 400);
    const campaign = campaignId ? await findCampaignById(campaignId) : null;
    if (campaignId && !campaign) return json({ error: 'The selected campaign was not found.' }, 404);
    if (batchType === 'campaign_church_pickup') {
      if (!campaign || !['church_batch', 'hybrid'].includes(campaign.fulfillmentMethod)) return json({ error: 'Church-pickup batches require a campaign that supports church pickup.' }, 400);
      if (!churchBatchReadiness(campaign).complete) return json({ error: 'Complete the campaign pickup configuration before creating a church-pickup batch.' }, 400);
    }

    const store = getStore('izhe-production-batches');
    const entry = await store.getWithMetadata(id, { type: 'json', consistency: 'strong' });
    if (payload.expectedUpdatedAt && entry?.data?.updatedAt !== payload.expectedUpdatedAt) return json({ error: 'This production batch changed in another session. Reload before saving.' }, 409);
    const items = cleanItems(input.items);
    if (campaignId && items.some((item) => item.campaignId !== campaignId)) return json({ error: 'A campaign production batch can contain only fulfillment units attributed to that campaign.' }, 400);
    if (batchType === 'campaign_church_pickup' && items.some((item) => item.sourceType !== 'order')) return json({ error: 'Automatic church-pickup batches contain paid order items only. Give One redemptions remain separate.' }, 400);

    const now = new Date().toISOString();
    const destination = batchType === 'campaign_church_pickup' ? pickupDestinationSnapshot(campaign) : input.destination || entry?.data?.destination || null;
    const batch = {
      id,
      name,
      batchType,
      vendor: cleanText(input.vendor, 180),
      campaignId,
      campaignTitle: campaign?.title || '',
      campaignOrganization: campaign?.organization || '',
      destination,
      status,
      dueDate: input.dueDate ? new Date(input.dueDate).toISOString() : '',
      submittedAt: status === 'submitted' && !entry?.data?.submittedAt ? now : entry?.data?.submittedAt || '',
      receivedAt: ['received', 'completed'].includes(status) && !entry?.data?.receivedAt ? now : entry?.data?.receivedAt || '',
      receivedBy: cleanText(input.receivedBy || entry?.data?.receivedBy, 160),
      completedAt: status === 'completed' ? (entry?.data?.completedAt || now) : entry?.data?.completedAt || '',
      tracking: cleanText(input.tracking, 180),
      vendorToChurchTracking: cleanText(input.vendorToChurchTracking || input.tracking, 180),
      notes: cleanText(input.notes, 3000),
      items,
      productionSummary: batchProductionSummary(items),
      itemCount: items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      createdAt: entry?.data?.createdAt || now,
      updatedAt: now,
      statusHistory: appendStatusHistory(entry?.data || {}, status, cleanText(payload.note, 500))
    };
    const result = entry ? await store.setJSON(id, batch, { onlyIfMatch: entry.etag }) : await store.setJSON(id, batch, { onlyIfNew: true });
    if (!result.modified) return json({ error: 'The production batch could not be saved because it changed in another session.' }, 409);
    await syncBatchSources(entry?.data?.items || [], items, batch);
    return json({ batch }, entry ? 200 : 201);
  } catch (error) {
    console.error('admin-save-batch', error);
    return json({ error: error.message || 'Production batch could not be saved.' }, 400);
  }
};
