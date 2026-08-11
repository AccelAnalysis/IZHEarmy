import { getStore } from '@netlify/blobs';
import { requireAdmin } from './_shared/admin-auth.mjs';
import { appendStatusHistory, ORDER_STATUSES } from './_shared/operations-rules.mjs';
import { cleanText, json, methodNotAllowed } from './_shared/http.mjs';

export default async (request) => {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const payload = await request.json();
    const sessionId = cleanText(payload.sessionId, 180);
    const status = cleanText(payload.status, 40);
    if (!sessionId || !ORDER_STATUSES.includes(status)) return json({ error: 'Invalid order update.' }, 400);
    const store = getStore('izhe-orders');
    const entry = await store.getWithMetadata(sessionId, { type: 'json', consistency: 'strong' });
    if (!entry) return json({ error: 'Order not found.' }, 404);
    if (payload.expectedUpdatedAt && entry.data.updatedAt !== payload.expectedUpdatedAt) return json({ error: 'This order changed in another session. Refresh and retry.' }, 409);
    const churchPickup = entry.data.fulfillment?.mode === 'church_batch';
    if (churchPickup && ['ready_to_ship', 'shipped', 'delivered'].includes(status)) return json({ error: 'Church-pickup orders do not use shipping statuses. Use the pickup workflow instead.' }, 400);
    if (churchPickup && ['completed', 'picked_up'].includes(status) && entry.data.fulfillment?.status !== 'picked_up') return json({ error: 'Use the pickup handoff action to complete a church-pickup order.' }, 400);
    const note = cleanText(payload.note, 500);
    const updatedAt = new Date().toISOString();
    const updated = {
      ...entry.data,
      status,
      tracking: churchPickup ? entry.data.tracking || '' : cleanText(payload.tracking, 160),
      shippingProvider: churchPickup ? entry.data.shippingProvider || '' : cleanText(payload.shippingProvider, 80),
      internalNotes: cleanText(payload.internalNotes, 2000),
      batchId: cleanText(payload.batchId, 100) || entry.data.batchId || '',
      statusHistory: appendStatusHistory(entry.data, status, note),
      updatedAt
    };
    if (!churchPickup && status === 'shipped' && !updated.shippedAt) updated.shippedAt = updatedAt;
    if (!churchPickup && ['delivered', 'completed'].includes(status) && !updated.deliveredAt) updated.deliveredAt = updatedAt;
    const result = await store.setJSON(sessionId, updated, { onlyIfMatch: entry.etag });
    if (!result.modified) return json({ error: 'This order changed in another session. Refresh and retry.' }, 409);
    return json({ updated });
  } catch (error) {
    console.error('admin-update-order', error);
    return json({ error: error.message || 'Order could not be updated.' }, 400);
  }
};
