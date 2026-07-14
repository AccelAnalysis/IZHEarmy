import { getStore } from '@netlify/blobs';
import { requireAdmin } from './_shared/admin-auth.mjs';
import {
  appendStatusHistory,
  BATCH_STATUSES,
  batchProductionSummary,
  createBatchId
} from './_shared/operations-rules.mjs';
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
      quantity: Math.max(1, Math.min(1000, Number(item?.quantity || 1)))
    };
  }).filter(Boolean);
}

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
  const updated = {
    ...entry.data,
    batchId: remove ? '' : batch.id,
    status,
    statusHistory: status !== entry.data.status
      ? appendStatusHistory(entry.data, status, remove ? `Removed from ${batch.id}` : `Production batch ${batch.id}`)
      : entry.data.statusHistory,
    updatedAt: new Date().toISOString()
  };
  await store.setJSON(item.sourceId, updated, { onlyIfMatch: entry.etag });
}

async function syncOrder(item, batch, remove = false) {
  const store = getStore('izhe-orders');
  const entry = await store.getWithMetadata(item.sourceId, { type: 'json', consistency: 'strong' });
  if (!entry) return;
  const assignments = Array.isArray(entry.data.batchAssignments) ? [...entry.data.batchAssignments] : [];
  const remaining = assignments.filter((assignment) => assignment.sourceItemId !== item.sourceItemId);
  if (!remove) remaining.push({ batchId: batch.id, batchStatus: batch.status, sourceItemId: item.sourceItemId, itemIndex: item.itemIndex, quantity: item.quantity });
  const totalItems = Math.max(1, (entry.data.items || []).length);
  const assignedIndexes = new Set(remaining.map((assignment) => assignment.itemIndex).filter((value) => value != null));
  const allAssigned = assignedIndexes.size >= totalItems;
  const statuses = remaining.map((assignment) => assignment.batchStatus || 'ready');
  let status = entry.data.status;
  if (remaining.length === 0) {
    if (['allocated', 'in_production', 'ready_to_ship'].includes(status)) status = 'processing';
  } else if (allAssigned && statuses.every((value) => ['received', 'completed'].includes(value))) {
    status = 'ready_to_ship';
  } else if (statuses.some((value) => value === 'in_production') || statuses.some((value) => ['received', 'completed'].includes(value))) {
    status = 'in_production';
  } else if (allAssigned && statuses.every((value) => ['ready', 'submitted'].includes(value))) {
    status = 'allocated';
  } else {
    status = 'processing';
  }
  const updated = {
    ...entry.data,
    batchAssignments: remaining,
    batchId: remaining.length === 1 ? remaining[0].batchId : '',
    status,
    statusHistory: status !== entry.data.status
      ? appendStatusHistory(entry.data, status, remove ? `Removed from ${batch.id}` : `Production batch ${batch.id}`)
      : entry.data.statusHistory,
    updatedAt: new Date().toISOString()
  };
  await store.setJSON(item.sourceId, updated, { onlyIfMatch: entry.etag });
}

async function syncSources(previousItems, nextItems, batch) {
  const previous = new Map(previousItems.map((item) => [item.sourceItemId, item]));
  const next = new Map(nextItems.map((item) => [item.sourceItemId, item]));
  for (const [id, item] of previous) {
    if (next.has(id)) continue;
    if (item.sourceType === 'redemption') await syncRedemption(item, batch, true);
    else await syncOrder(item, batch, true);
  }
  for (const item of nextItems) {
    if (item.sourceType === 'redemption') await syncRedemption(item, batch, batch.status === 'cancelled');
    else await syncOrder(item, batch, batch.status === 'cancelled');
  }
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
    if (!BATCH_STATUSES.includes(status)) return json({ error: 'Invalid production batch status.' }, 400);
    const store = getStore('izhe-production-batches');
    const entry = await store.getWithMetadata(id, { type: 'json', consistency: 'strong' });
    if (payload.expectedUpdatedAt && entry?.data?.updatedAt !== payload.expectedUpdatedAt) {
      return json({ error: 'This production batch changed in another session. Reload before saving.' }, 409);
    }
    const items = cleanItems(input.items);
    const now = new Date().toISOString();
    const batch = {
      id,
      name,
      vendor: cleanText(input.vendor, 180),
      status,
      dueDate: input.dueDate ? new Date(input.dueDate).toISOString() : '',
      submittedAt: status === 'submitted' && !entry?.data?.submittedAt ? now : entry?.data?.submittedAt || '',
      completedAt: status === 'completed' ? now : entry?.data?.completedAt || '',
      tracking: cleanText(input.tracking, 180),
      notes: cleanText(input.notes, 3000),
      items,
      productionSummary: batchProductionSummary(items),
      itemCount: items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      createdAt: entry?.data?.createdAt || now,
      updatedAt: now,
      statusHistory: appendStatusHistory(entry?.data || {}, status, cleanText(payload.note, 500))
    };
    const result = entry
      ? await store.setJSON(id, batch, { onlyIfMatch: entry.etag })
      : await store.setJSON(id, batch, { onlyIfNew: true });
    if (!result.modified) return json({ error: 'The production batch could not be saved because it changed in another session.' }, 409);
    await syncSources(entry?.data?.items || [], items, batch);
    return json({ batch }, entry ? 200 : 201);
  } catch (error) {
    console.error('admin-save-batch', error);
    return json({ error: error.message || 'Production batch could not be saved.' }, 400);
  }
};
