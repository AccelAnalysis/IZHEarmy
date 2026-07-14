import { getStore } from '@netlify/blobs';
import { json, methodNotAllowed, cleanText } from './_shared/http.mjs';

const ALLOWED = new Set(['pending_fulfillment', 'processing', 'fulfilled', 'cancelled']);

export default async (request) => {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!process.env.IZHE_ADMIN_TOKEN || token !== process.env.IZHE_ADMIN_TOKEN) return json({ error: 'Unauthorized.' }, 401);
  try {
    const payload = await request.json();
    const confirmation = cleanText(payload.confirmation, 80);
    const status = cleanText(payload.status, 40);
    const tracking = cleanText(payload.tracking, 120);
    if (!confirmation || !ALLOWED.has(status)) return json({ error: 'Invalid redemption update.' }, 400);
    const store = getStore('izhe-redemptions');
    const entry = await store.getWithMetadata(confirmation, { type: 'json', consistency: 'strong' });
    if (!entry) return json({ error: 'Redemption not found.' }, 404);
    const updated = { ...entry.data, status, tracking, updatedAt: new Date().toISOString() };
    const result = await store.setJSON(confirmation, updated, { onlyIfMatch: entry.etag });
    if (!result.modified) return json({ error: 'This redemption changed in another session. Refresh and retry.' }, 409);
    return json({ updated });
  } catch (error) {
    return json({ error: error.message || 'Redemption could not be updated.' }, 400);
  }
};
