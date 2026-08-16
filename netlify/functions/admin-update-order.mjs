import { getStore } from '@netlify/blobs';
import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import { readJsonBody } from './_shared/admin-request.mjs';
import { appendStatusHistory, ORDER_STATUSES } from './_shared/operations-rules.mjs';
import { appendFulfillmentHistory } from './_shared/fulfillment-rules.mjs';
import { cleanText, json } from './_shared/http.mjs';

export default adminEndpoint({
  methods: ['POST'],
  permission: 'operations.orders.write',
  csrf: true,
  recentAuth: false,
  auditAction: 'order.update',
  rateClass: 'write',
  contentTypes: ['application/json'],
  maxBodyBytes: 250_000
}, async (request, context) => {
  const payload = await readJsonBody(request);
  const sessionId = cleanText(payload.sessionId, 180);
  const status = cleanText(payload.status, 40);
  if (!sessionId || !ORDER_STATUSES.includes(status)) throw Object.assign(new Error('Invalid order update.'), { statusCode: 400 });
  const store = getStore('izhe-orders');
  const entry = await store.getWithMetadata(sessionId, { type: 'json', consistency: 'strong' });
  if (!entry) throw Object.assign(new Error('Order not found.'), { statusCode: 404 });
  if (payload.expectedUpdatedAt && entry.data.updatedAt !== payload.expectedUpdatedAt) {
    throw Object.assign(new Error('This order changed in another session. Refresh and retry.'), { statusCode: 409 });
  }

  const churchPickup = entry.data.fulfillment?.mode === 'church_batch';
  const note = cleanText(payload.note, 500);
  if (churchPickup && status !== entry.data.status && !['cancelled', 'exception'].includes(status)) {
    throw Object.assign(new Error('Church-pickup lifecycle statuses are controlled by production batches and the pickup handoff workflow.'), { statusCode: 400 });
  }
  if (churchPickup && status !== entry.data.status && !note) {
    throw Object.assign(new Error('A note is required when cancelling or placing a church-pickup order into exception status.'), { statusCode: 400 });
  }

  const updatedAt = new Date().toISOString();
  let fulfillment = entry.data.fulfillment;
  if (churchPickup && status !== entry.data.status) {
    fulfillment = appendFulfillmentHistory(
      entry.data.fulfillment,
      status === 'cancelled' ? 'cancelled' : 'exception',
      note,
      `admin:${context.userId}`,
      updatedAt
    );
  }
  const updated = {
    ...entry.data,
    status,
    fulfillment,
    tracking: churchPickup ? entry.data.tracking || '' : cleanText(payload.tracking, 160),
    shippingProvider: churchPickup ? entry.data.shippingProvider || '' : cleanText(payload.shippingProvider, 80),
    internalNotes: cleanText(payload.internalNotes, 2000),
    batchId: cleanText(payload.batchId, 100) || entry.data.batchId || '',
    statusHistory: appendStatusHistory(entry.data, status, note),
    updatedAt,
    lastAdministrativeActorId: context.userId
  };
  if (!churchPickup && status === 'shipped' && !updated.shippedAt) updated.shippedAt = updatedAt;
  if (!churchPickup && ['delivered', 'completed'].includes(status) && !updated.deliveredAt) updated.deliveredAt = updatedAt;
  const result = await store.setJSON(sessionId, updated, { onlyIfMatch: entry.etag });
  if (!result.modified) throw Object.assign(new Error('This order changed in another session. Refresh and retry.'), { statusCode: 409 });
  return {
    response: json({ updated }),
    audit: {
      resourceType: 'order',
      resourceId: sessionId,
      reason: note,
      beforeSummary: { status: entry.data.status, fulfillment: entry.data.fulfillment, batchId: entry.data.batchId },
      afterSummary: { status: updated.status, fulfillment: updated.fulfillment, batchId: updated.batchId }
    }
  };
});
