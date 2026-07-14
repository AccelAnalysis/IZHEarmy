import { getStore } from '@netlify/blobs';
import { requireAdmin } from './_shared/admin-auth.mjs';
import { appendStatusHistory, REDEMPTION_STATUSES } from './_shared/operations-rules.mjs';
import { json, methodNotAllowed, cleanText } from './_shared/http.mjs';

export default async (request) => {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const payload = await request.json();
    const confirmation = cleanText(payload.confirmation, 80);
    const status = cleanText(payload.status, 40);
    if (!confirmation || !REDEMPTION_STATUSES.includes(status)) return json({ error: 'Invalid redemption update.' }, 400);
    const store = getStore('izhe-redemptions');
    const entry = await store.getWithMetadata(confirmation, { type: 'json', consistency: 'strong' });
    if (!entry) return json({ error: 'Redemption not found.' }, 404);
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
    if (['delivered', 'fulfilled'].includes(status) && !updated.deliveredAt) updated.deliveredAt = updated.updatedAt;
    const result = await store.setJSON(confirmation, updated, { onlyIfMatch: entry.etag });
    if (!result.modified) return json({ error: 'This redemption changed in another session. Refresh and retry.' }, 409);
    return json({ updated });
  } catch (error) {
    console.error('admin-update-redemption', error);
    return json({ error: error.message || 'Redemption could not be updated.' }, 400);
  }
};
