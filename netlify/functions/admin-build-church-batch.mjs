import { getStore } from '@netlify/blobs';
import { requireAdmin } from './_shared/admin-auth.mjs';
import { findCampaignById, listStoreJSON } from './_shared/campaign-service.mjs';
import { appendStatusHistory, createBatchId } from './_shared/operations-rules.mjs';
import { churchBatchReadiness } from './_shared/fulfillment-rules.mjs';
import { assembleChurchPickupItems, nextChurchBatchNumber, pickupDestinationSnapshot, selectEditableChurchBatch } from './_shared/church-batch-rules.mjs';
import { syncBatchSources } from './_shared/batch-sync.mjs';
import { cleanText, json, methodNotAllowed } from './_shared/http.mjs';

async function acquireCampaignLock(store, lockKey) {
  let result = await store.setJSON(lockKey, { createdAt: new Date().toISOString() }, { onlyIfNew: true });
  if (result.modified) return true;
  const existing = await store.get(lockKey, { type: 'json', consistency: 'strong' }).catch(() => null);
  const createdAt = existing?.createdAt ? new Date(existing.createdAt) : null;
  if (createdAt && !Number.isNaN(createdAt.valueOf()) && Date.now() - createdAt.valueOf() > 300000) {
    await store.delete(lockKey).catch(() => {});
    result = await store.setJSON(lockKey, { createdAt: new Date().toISOString(), recoveredStaleLock: true }, { onlyIfNew: true });
  }
  return result.modified;
}

export default async (request) => {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  const denied = requireAdmin(request); if (denied) return denied;
  let store; let lockKey = ''; let locked = false;
  try {
    const payload = await request.json(); const campaignId = cleanText(payload.campaignId, 100); if (!campaignId) return json({ error: 'Campaign ID is required.' }, 400);
    const campaign = await findCampaignById(campaignId); if (!campaign) return json({ error: 'Campaign not found.' }, 404);
    if (!['church_batch', 'hybrid'].includes(campaign.fulfillmentMethod)) return json({ error: 'This campaign does not support church-pickup fulfillment.' }, 400);
    const readiness = churchBatchReadiness(campaign); if (!readiness.complete) return json({ error: `Complete the church-pickup configuration first: ${readiness.errors.join(' ')}` }, 400);

    store = getStore('izhe-production-batches');
    lockKey = `lock-church-pickup-${campaignId}`;
    locked = await acquireCampaignLock(store, lockKey);
    if (!locked) return json({ error: 'A church-pickup batch refresh is already in progress for this campaign. Retry after it finishes.' }, 409);

    const [orders, batches] = await Promise.all([listStoreJSON('izhe-orders'), listStoreJSON('izhe-production-batches')]);
    const target = selectEditableChurchBatch(batches, campaignId);
    const selection = assembleChurchPickupItems({ campaign, orders, batches, targetBatch: target });
    if (!target && !selection.items.length) return json({ batch: null, created: false, updated: false, ordersIncluded: 0, unitsIncluded: 0, ordersExcluded: selection.excluded.length, exclusions: selection.excluded, allocationAdjustments: selection.adjustments, message: 'No eligible unallocated paid church-pickup items are available.' });

    const existingEntry = target ? await store.getWithMetadata(target.id, { type: 'json', consistency: 'strong' }) : null;
    if (target && (!existingEntry || !['draft', 'ready'].includes(existingEntry.data.status))) return json({ error: 'The editable batch changed. Reload and retry.' }, 409);
    if (payload.expectedUpdatedAt && existingEntry?.data?.updatedAt !== payload.expectedUpdatedAt) return json({ error: 'The church-pickup batch changed in another session. Reload and retry.' }, 409);

    const now = new Date().toISOString(); const number = target?.batchNumber || nextChurchBatchNumber(batches, campaignId);
    const batch = { ...(target || {}), id: target?.id || createBatchId(), name: `${campaign.title} — Church Pickup Batch ${number}`, batchNumber: number, batchType: 'campaign_church_pickup', campaignId, campaignTitle: campaign.title, campaignOrganization: campaign.organization, destination: pickupDestinationSnapshot(campaign), vendor: target?.vendor || '', dueDate: target?.dueDate || campaign.churchBatch?.estimatedReadyAt || '', tracking: target?.tracking || '', vendorToChurchTracking: target?.vendorToChurchTracking || '', receivedAt: target?.receivedAt || '', receivedBy: target?.receivedBy || '', notes: target?.notes || campaign.churchBatch?.internalInstructions || '', status: target?.status || 'draft', items: selection.items, productionSummary: selection.productionSummary, itemCount: selection.unitsIncluded, createdAt: target?.createdAt || now, updatedAt: now, statusHistory: target?.statusHistory || appendStatusHistory({}, 'draft', 'Church pickup batch assembled from eligible paid campaign orders.') };
    const result = existingEntry ? await store.setJSON(batch.id, batch, { onlyIfMatch: existingEntry.etag }) : await store.setJSON(batch.id, batch, { onlyIfNew: true });
    if (!result.modified) return json({ error: 'The church-pickup batch changed in another session. Reload and retry.' }, 409);

    await syncBatchSources(existingEntry?.data?.items || [], selection.items, batch);
    const exclusionOrders = new Set(selection.excluded.map((item) => item.sessionId).filter(Boolean));
    return json({ batch, created: !existingEntry, updated: Boolean(existingEntry), ordersIncluded: selection.ordersIncluded, unitsIncluded: selection.unitsIncluded, ordersExcluded: exclusionOrders.size, exclusions: selection.excluded, allocationAdjustments: selection.adjustments }, existingEntry ? 200 : 201);
  } catch (error) {
    console.error('admin-build-church-batch', error);
    return json({ error: error.message || 'Church-pickup batch could not be assembled.' }, 400);
  } finally {
    if (locked && store && lockKey) await store.delete(lockKey).catch(() => {});
  }
};
