import { getStore } from '@netlify/blobs';
import { requireAdmin } from './_shared/admin-auth.mjs';
import { appendStatusHistory, REDEMPTION_STATUSES } from './_shared/operations-rules.mjs';
import { createReconciliationTask } from './_shared/payment-service.mjs';
import { json, methodNotAllowed, cleanText } from './_shared/http.mjs';

function obligationStatus(redemptionStatus) {
  if (redemptionStatus === 'fulfilled') return 'fulfilled';
  if (['allocated', 'in_production', 'ready_to_ship', 'shipped', 'delivered'].includes(redemptionStatus)) return 'in_fulfillment';
  if (['cancelled', 'exception'].includes(redemptionStatus)) return 'exception_review';
  return 'redeemed';
}

async function syncObligation(redemption, status, note) {
  let obligationId = redemption.obligationId || '';
  if (!obligationId && redemption.code) {
    const code = await getStore('izhe-give-codes').get(redemption.code, { type: 'json', consistency: 'strong' });
    obligationId = code?.obligationId || '';
  }
  if (!obligationId) return null;
  const store = getStore('izhe-give-obligations');
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = await store.getWithMetadata(obligationId, { type: 'json', consistency: 'strong' });
    if (!current?.data) throw new Error('The deterministic Give One obligation is missing.');
    const nextStatus = obligationStatus(status);
    const at = new Date().toISOString();
    if (current.data.status === nextStatus && current.data.fulfillmentId === redemption.confirmation) return current.data;
    const next = {
      ...current.data,
      status: nextStatus,
      redemptionId: current.data.redemptionId || redemption.confirmation,
      fulfillmentId: redemption.confirmation,
      exceptionState: nextStatus === 'exception_review' ? `redemption_${status}` : current.data.exceptionState || '',
      updatedAt: at,
      statusHistory: [...(current.data.statusHistory || []), { status: nextStatus, at, actor: 'admin-token', reason: note || `redemption_${status}` }].slice(-100)
    };
    const saved = await store.setJSON(obligationId, next, { onlyIfMatch: current.etag });
    if (saved.modified) return next;
  }
  throw new Error('The Give One obligation changed while fulfillment state was being synchronized.');
}

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
    try {
      await syncObligation(updated, status, note);
    } catch (error) {
      await createReconciliationTask({
        type: 'give_one_fulfillment_state_mismatch',
        sessionId: '',
        campaignId: updated.campaignId || '',
        sourceId: confirmation,
        severity: 'critical',
        message: 'Gift fulfillment was updated, but its deterministic Give One obligation requires reconciliation.',
        details: { code: String(error?.message || 'obligation_sync_failed').slice(0, 240) }
      }).catch(() => {});
      return json({ error: 'Fulfillment was saved, but Give One obligation reconciliation is required.', updated }, 500);
    }
    return json({ updated });
  } catch (error) {
    console.error('admin-update-redemption', String(error?.message || error).slice(0, 500));
    return json({ error: error.message || 'Redemption could not be updated.' }, 400);
  }
};
