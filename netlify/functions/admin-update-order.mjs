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
    const note = cleanText(payload.note, 500);
    const updated = {
      ...entry.data,
      status,
      tracking: cleanText(payload.tracking, 160),
      shippingProvider: cleanText(payload.shippingProvider, 80),
      internalNotes: cleanText(payload.internalNotes, 2000),
      batchId: cleanText(payload.batchId, 100),
      statusHistory: appendStatusHistory(entry.data, status, note),
      updatedAt: new Date().toISOString()
    };
    if (status === 'shipped' && !updated.shippedAt) updated.shippedAt = updated.updatedAt;
    if (['delivered', 'completed'].includes(status) && !updated.deliveredAt) updated.deliveredAt = updated.updatedAt;
    const result = await store.setJSON(sessionId, updated, { onlyIfMatch: entry.etag });
    if (!result.modified) return json({ error: 'This order changed in another session. Refresh and retry.' }, 409);
    return json({ updated });
  } catch (error) {
    console.error('admin-update-order', error);
    return json({ error: error.message || 'Order could not be updated.' }, 400);
  }
};
