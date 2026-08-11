import { getStore } from '@netlify/blobs';
import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import { readJsonBody } from './_shared/admin-request.mjs';
import { findCampaignById, listStoreJSON } from './_shared/campaign-service.mjs';
import { appendStatusHistory, createBatchId } from './_shared/operations-rules.mjs';
import { churchBatchReadiness } from './_shared/fulfillment-rules.mjs';
import {
  assembleChurchPickupItems,
  nextChurchBatchNumber,
  pickupDestinationSnapshot,
  selectEditableChurchBatch
} from './_shared/church-batch-rules.mjs';
import { syncBatchSources } from './_shared/batch-sync.mjs';
import { cleanText, json } from './_shared/http.mjs';

async function acquireCampaignLock(store, lockKey, actorId) {
  let result = await store.setJSON(lockKey, { createdAt: new Date().toISOString(), actorId }, { onlyIfNew: true });
  if (result.modified) return true;
  const existing = await store.get(lockKey, { type: 'json', consistency: 'strong' }).catch(() => null);
  const createdAt = existing?.createdAt ? new Date(existing.createdAt) : null;
  if (createdAt && !Number.isNaN(createdAt.valueOf()) && Date.now() - createdAt.valueOf() > 300000) {
    await store.delete(lockKey).catch(() => {});
    result = await store.setJSON(lockKey, {
      createdAt: new Date().toISOString(),
      actorId,
      recoveredStaleLock: true
    }, { onlyIfNew: true });
  }
  return result.modified;
}

export default adminEndpoint({
  methods: ['POST'],
  permission: 'operations.batches.write',
  csrf: true,
  recentAuth: false,
  auditAction: 'church_batch.build',
  rateClass: 'bulk',
  contentTypes: ['application/json'],
  maxBodyBytes: 100_000
}, async (request, context) => {
  let store;
  let lockKey = '';
  let locked = false;
  try {
    const payload = await readJsonBody(request);
    const campaignId = cleanText(payload.campaignId, 100);
    if (!campaignId) throw Object.assign(new Error('Campaign ID is required.'), { statusCode: 400 });
    const campaign = await findCampaignById(campaignId);
    if (!campaign) throw Object.assign(new Error('Campaign not found.'), { statusCode: 404 });
    if (!['church_batch', 'hybrid'].includes(campaign.fulfillmentMethod)) {
      throw Object.assign(new Error('This campaign does not support church-pickup fulfillment.'), { statusCode: 400 });
    }
    const readiness = churchBatchReadiness(campaign);
    if (!readiness.complete) {
      throw Object.assign(new Error(`Complete the church-pickup configuration first: ${readiness.errors.join(' ')}`), { statusCode: 400 });
    }

    store = getStore('izhe-production-batches');
    lockKey = `lock-church-pickup-${campaignId}`;
    locked = await acquireCampaignLock(store, lockKey, context.userId);
    if (!locked) {
      throw Object.assign(new Error('A church-pickup batch refresh is already in progress for this campaign. Retry after it finishes.'), { statusCode: 409 });
    }

    const [orders, batches] = await Promise.all([
      listStoreJSON('izhe-orders'),
      listStoreJSON('izhe-production-batches')
    ]);
    const target = selectEditableChurchBatch(batches, campaignId);
    const selection = assembleChurchPickupItems({ campaign, orders, batches, targetBatch: target });
    if (!target && !selection.items.length) {
      return {
        response: json({
          batch: null,
          created: false,
          updated: false,
          ordersIncluded: 0,
          unitsIncluded: 0,
          ordersExcluded: selection.excluded.length,
          exclusions: selection.excluded,
          allocationAdjustments: selection.adjustments,
          message: 'No eligible unallocated paid church-pickup items are available.'
        }),
        audit: {
          resourceType: 'church_pickup_batch',
          resourceId: campaignId,
          result: 'no_change',
          afterSummary: { ordersIncluded: 0, unitsIncluded: 0, ordersExcluded: selection.excluded.length }
        }
      };
    }

    const existingEntry = target
      ? await store.getWithMetadata(target.id, { type: 'json', consistency: 'strong' })
      : null;
    if (target && (!existingEntry || !['draft', 'ready'].includes(existingEntry.data.status))) {
      throw Object.assign(new Error('The editable batch changed. Reload and retry.'), { statusCode: 409 });
    }
    if (payload.expectedUpdatedAt && existingEntry?.data?.updatedAt !== payload.expectedUpdatedAt) {
      throw Object.assign(new Error('The church-pickup batch changed in another session. Reload and retry.'), { statusCode: 409 });
    }

    const now = new Date().toISOString();
    const number = target?.batchNumber || nextChurchBatchNumber(batches, campaignId);
    const batch = {
      ...(target || {}),
      id: target?.id || createBatchId(),
      name: `${campaign.title} — Church Pickup Batch ${number}`,
      batchNumber: number,
      batchType: 'campaign_church_pickup',
      campaignId,
      campaignTitle: campaign.title,
      campaignOrganization: campaign.organization,
      destination: pickupDestinationSnapshot(campaign),
      vendor: target?.vendor || '',
      dueDate: target?.dueDate || campaign.churchBatch?.estimatedReadyAt || '',
      tracking: target?.tracking || '',
      vendorToChurchTracking: target?.vendorToChurchTracking || '',
      receivedAt: target?.receivedAt || '',
      receivedBy: target?.receivedBy || '',
      notes: target?.notes || campaign.churchBatch?.internalInstructions || '',
      status: target?.status || 'draft',
      items: selection.items,
      productionSummary: selection.productionSummary,
      itemCount: selection.unitsIncluded,
      createdAt: target?.createdAt || now,
      updatedAt: now,
      lastAdministrativeActorId: context.userId,
      statusHistory: target?.statusHistory || appendStatusHistory(
        {},
        'draft',
        'Church pickup batch assembled from eligible paid campaign orders.',
        `admin:${context.userId}`
      )
    };
    const result = existingEntry
      ? await store.setJSON(batch.id, batch, { onlyIfMatch: existingEntry.etag })
      : await store.setJSON(batch.id, batch, { onlyIfNew: true });
    if (!result.modified) {
      throw Object.assign(new Error('The church-pickup batch changed in another session. Reload and retry.'), { statusCode: 409 });
    }

    await syncBatchSources(existingEntry?.data?.items || [], selection.items, batch);
    const exclusionOrders = new Set(selection.excluded.map((item) => item.sessionId).filter(Boolean));
    return {
      response: json({
        batch,
        created: !existingEntry,
        updated: Boolean(existingEntry),
        ordersIncluded: selection.ordersIncluded,
        unitsIncluded: selection.unitsIncluded,
        ordersExcluded: exclusionOrders.size,
        exclusions: selection.excluded,
        allocationAdjustments: selection.adjustments
      }, existingEntry ? 200 : 201),
      audit: {
        resourceType: 'church_pickup_batch',
        resourceId: batch.id,
        beforeSummary: existingEntry?.data ? { status: existingEntry.data.status, itemCount: existingEntry.data.itemCount } : null,
        afterSummary: {
          status: batch.status,
          campaignId,
          ordersIncluded: selection.ordersIncluded,
          unitsIncluded: selection.unitsIncluded,
          ordersExcluded: exclusionOrders.size,
          created: !existingEntry
        }
      }
    };
  } finally {
    if (locked && store && lockKey) await store.delete(lockKey).catch(() => {});
  }
});
