import { getStore } from '@netlify/blobs';
import { requireAdmin } from './_shared/admin-auth.mjs';
import { appendStatusHistory } from './_shared/operations-rules.mjs';
import { appendFulfillmentHistory, legacyFulfillmentSnapshot, resolvePickupHandoffTransition } from './_shared/fulfillment-rules.mjs';
import { cleanText, json, methodNotAllowed } from './_shared/http.mjs';

export default async (request) => {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  const denied = requireAdmin(request); if (denied) return denied;
  try {
    const payload = await request.json(); const sessionId = cleanText(payload.sessionId, 180); const action = cleanText(payload.action || 'picked_up', 40); if (!sessionId) return json({ error: 'Order reference is required.' }, 400);
    const store = getStore('izhe-orders'); const entry = await store.getWithMetadata(sessionId, { type: 'json', consistency: 'strong' }); if (!entry) return json({ error: 'Order not found.' }, 404);
    if (payload.expectedUpdatedAt && entry.data.updatedAt !== payload.expectedUpdatedAt) return json({ error: 'This order changed in another session. Refresh and retry.' }, 409);
    const currentFulfillment = legacyFulfillmentSnapshot(entry.data); if (currentFulfillment.mode !== 'church_batch') return json({ error: 'Pickup handoff applies only to church-pickup orders.' }, 400);
    const note = cleanText(payload.note, 1000); const releasedBy = cleanText(payload.releasedBy, 160); const recipientName = cleanText(payload.recipientName, 160); const now = new Date().toISOString(); let handoff = entry.data.pickupHandoff || {};
    let transition; try { transition = resolvePickupHandoffTransition({ currentStatus: currentFulfillment.status, orderStatus: entry.data.status, action, note, releasedBy }); } catch (error) { const conflict = /already|Only|must be reversed/.test(error.message); return json({ error: error.message }, conflict ? 409 : 400); }
    const status = transition.orderStatus; const fulfillmentStatus = transition.fulfillmentStatus;
    if (action === 'picked_up') handoff = { pickedUpAt: now, releasedBy, recipientName: recipientName || entry.data.customerName || '', note, correctionHistory: handoff.correctionHistory || [] };
    else if (action === 'reverse_pickup') handoff = { ...handoff, correctionHistory: [...(handoff.correctionHistory || []), { at: now, actor: releasedBy || 'admin', note, previousPickedUpAt: handoff.pickedUpAt || '' }].slice(-50), pickedUpAt: '', releasedBy: '', recipientName: '' };
    else handoff = { ...handoff, exceptionAt: now, exceptionType: action, exceptionNote: note, releasedBy: releasedBy || handoff.releasedBy || '' };
    const updated = { ...entry.data, status, fulfillment: appendFulfillmentHistory(currentFulfillment, fulfillmentStatus, note, releasedBy || 'admin', now), pickupHandoff: handoff, statusHistory: appendStatusHistory(entry.data, status, note, releasedBy || 'admin'), updatedAt: now };
    const result = await store.setJSON(sessionId, updated, { onlyIfMatch: entry.etag }); if (!result.modified) return json({ error: 'This order changed in another session. Refresh and retry.' }, 409); return json({ order: updated });
  } catch (error) { console.error('admin-pickup-order', error); return json({ error: error.message || 'Pickup handoff could not be recorded.' }, 400); }
};
