import { getStore } from '@netlify/blobs';
import { appendStatusHistory, resolveOrderBatchLifecycle } from './operations-rules.mjs';
import { appendFulfillmentHistory, legacyFulfillmentSnapshot } from './fulfillment-rules.mjs';

function sourceStatus(batchStatus) {
  if (batchStatus === 'ready' || batchStatus === 'submitted') return 'allocated';
  if (batchStatus === 'in_production') return 'in_production';
  if (batchStatus === 'received' || batchStatus === 'completed') return 'ready_to_ship';
  return null;
}

async function syncRedemption(item, batch, remove = false) {
  const store = getStore('izhe-redemptions');
  const entry = await store.getWithMetadata(item.sourceId, { type: 'json', consistency: 'strong' });
  if (!entry) return;
  if (remove && entry.data.batchId !== batch.id) return;
  const resetStatuses = new Set(['allocated', 'in_production', 'ready_to_ship']);
  const status = remove ? (resetStatuses.has(entry.data.status) ? 'approved' : entry.data.status) : sourceStatus(batch.status) || entry.data.status;
  const updated = { ...entry.data, batchId: remove ? '' : batch.id, status, statusHistory: status !== entry.data.status ? appendStatusHistory(entry.data, status, remove ? `Removed from ${batch.id}` : `Production batch ${batch.id}`) : entry.data.statusHistory, updatedAt: new Date().toISOString() };
  await store.setJSON(item.sourceId, updated, { onlyIfMatch: entry.etag });
}

async function syncOrder(item, batch, remove = false) {
  const store = getStore('izhe-orders');
  const entry = await store.getWithMetadata(item.sourceId, { type: 'json', consistency: 'strong' });
  if (!entry) return;
  const assignments = Array.isArray(entry.data.batchAssignments) ? [...entry.data.batchAssignments] : [];
  const remaining = assignments.filter((assignment) => assignment.sourceItemId !== item.sourceItemId);
  if (!remove) remaining.push({ batchId: batch.id, batchType: batch.batchType || 'manual', batchStatus: batch.status, sourceItemId: item.sourceItemId, itemIndex: item.itemIndex, quantity: item.quantity, campaignId: batch.campaignId || '' });
  const now = new Date().toISOString();
  const churchPickup = entry.data.fulfillment?.mode === 'church_batch';
  let fulfillment = entry.data.fulfillment || legacyFulfillmentSnapshot(entry.data);
  const next = resolveOrderBatchLifecycle({ mode: churchPickup ? 'church_batch' : 'individual_shipping', orderStatus: entry.data.status, itemCount: (entry.data.items || []).length, assignments: remaining, remove });
  const status = next.orderStatus;
  if (churchPickup && fulfillment.status !== next.fulfillmentStatus) fulfillment = appendFulfillmentHistory(fulfillment, next.fulfillmentStatus, remove ? `Removed from ${batch.id}` : `Production batch ${batch.id}`, 'admin', now);
  else if (!churchPickup) fulfillment = { ...fulfillment, status: next.fulfillmentStatus };
  const updated = { ...entry.data, batchAssignments: remaining, batchId: remaining.length === 1 ? remaining[0].batchId : '', fulfillment, status, statusHistory: status !== entry.data.status ? appendStatusHistory(entry.data, status, remove ? `Removed from ${batch.id}` : `Production batch ${batch.id}`) : entry.data.statusHistory, updatedAt: now };
  await store.setJSON(item.sourceId, updated, { onlyIfMatch: entry.etag });
}

export async function syncBatchSources(previousItems, nextItems, batch) {
  const previous = new Map((previousItems || []).map((item) => [item.sourceItemId, item]));
  const next = new Map((nextItems || []).map((item) => [item.sourceItemId, item]));
  for (const [id, item] of previous) {
    if (next.has(id)) continue;
    if (item.sourceType === 'redemption') await syncRedemption(item, batch, true); else await syncOrder(item, batch, true);
  }
  for (const item of nextItems || []) {
    if (item.sourceType === 'redemption') await syncRedemption(item, batch, batch.status === 'cancelled'); else await syncOrder(item, batch, batch.status === 'cancelled');
  }
}
