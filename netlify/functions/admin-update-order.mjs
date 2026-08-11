import { getStore } from '@netlify/blobs';
import { requireAdmin } from './_shared/admin-auth.mjs';
import { appendStatusHistory, ORDER_STATUSES } from './_shared/operations-rules.mjs';
import { appendFulfillmentHistory } from './_shared/fulfillment-rules.mjs';
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
    const note = cleanText(payload.note, 500);
    if (churchPickup && status !== entry.data.status && !['cancelled', 'exception'].includes(status)) {
      return json({ error: 'Church-pickup lifecycle statuses are controlled by production batches and the pickup handoff workflow. Use those actions instead of the generic order-status editor.' }, 400);
    }
    if (churchPickup && status !== entry.data.status && !note) return json({ error: 'A note is required when cancelling or placing a church-pickup order into exception status.' }, 400);

    const updatedAt = new Date().toISOString();
    let fulfillment = entry.data.fulfillment;
    if (churchPickup && status !== entry.data.status) fulfillment = appendFulfillmentHistory(entry.data.fulfillment, status === 'cancelled' ? 'cancelled' : 'exception', note, 'admin', updatedAt);
    const updated = {
      ...entry.data,
      status,
      fulfillment,
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
