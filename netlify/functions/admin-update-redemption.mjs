import { getStore } from '@netlify/blobs';
import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import { readJsonBody, requiredExplanation } from './_shared/admin-request.mjs';
import { appendStatusHistory, REDEMPTION_STATUSES } from './_shared/operations-rules.mjs';
import { createReconciliationTask } from './_shared/payment-service.mjs';
import { json, cleanText } from './_shared/http.mjs';

function obligationStatus(redemptionStatus) {
  if (redemptionStatus === 'fulfilled') return 'fulfilled';
  if (['allocated', 'in_production', 'ready_to_ship', 'shipped', 'delivered'].includes(redemptionStatus)) return 'in_fulfillment';
  if (['cancelled', 'exception'].includes(redemptionStatus)) return 'exception_review';
  return 'redeemed';
}

async function syncObligation(redemption, status, note, actorId) {
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
      lastAdministrativeActorId: actorId,
      statusHistory: [
        ...(current.data.statusHistory || []),
        { status: nextStatus, at, actor: `admin:${actorId}`, reason: note || `redemption_${status}` }
      ].slice(-100)
    };
    const saved = await store.setJSON(obligationId, next, { onlyIfMatch: current.etag });
    if (saved.modified) return next;
  }
  throw new Error('The Give One obligation changed while fulfillment state was being synchronized.');
}

export default adminEndpoint({
  methods: ['POST'],
  permission: 'operations.give_one.write',
  csrf: true,
  recentAuth: false,
  auditAction: 'give_one.redemption.update',
  rateClass: 'write',
  contentTypes: ['application/json'],
  maxBodyBytes: 250_000
}, async (request, context) => {
  const payload = await readJsonBody(request);
  const confirmation = cleanText(payload.confirmation, 80);
  const status = cleanText(payload.status, 40);
  if (!confirmation || !REDEMPTION_STATUSES.includes(status)) {
    throw Object.assign(new Error('Invalid redemption update.'), { statusCode: 400 });
  }
  const store = getStore('izhe-redemptions');
  const entry = await store.getWithMetadata(confirmation, { type: 'json', consistency: 'strong' });
  if (!entry) throw Object.assign(new Error('Redemption not found.'), { statusCode: 404 });
  if (payload.expectedUpdatedAt && entry.data.updatedAt !== payload.expectedUpdatedAt) {
    throw Object.assign(new Error('This redemption changed in another session. Refresh and retry.'), { statusCode: 409 });
  }
  let note = cleanText(payload.note, 1_000);
  if (['cancelled', 'exception'].includes(status) && status !== entry.data.status) note = requiredExplanation(note);
  const updated = {
    ...entry.data,
    status,
    tracking: cleanText(payload.tracking, 160),
    shippingProvider: cleanText(payload.shippingProvider, 80),
    internalNotes: cleanText(payload.internalNotes, 2000),
    batchId: cleanText(payload.batchId, 100),
    statusHistory: appendStatusHistory(entry.data, status, note),
    updatedAt: new Date().toISOString(),
    lastAdministrativeActorId: context.userId
  };
  if (status === 'shipped' && !updated.shippedAt) updated.shippedAt = updated.updatedAt;
  if (['delivered', 'fulfilled'].includes(status) && !updated.deliveredAt) updated.deliveredAt = updated.updatedAt;
  const result = await store.setJSON(confirmation, updated, { onlyIfMatch: entry.etag });
  if (!result.modified) throw Object.assign(new Error('This redemption changed in another session. Refresh and retry.'), { statusCode: 409 });

  try {
    await syncObligation(updated, status, note, context.userId);
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
    return {
      response: json({ error: 'Fulfillment was saved, but Give One obligation reconciliation is required.', updated }, 500),
      audit: {
        resourceType: 'give_one_redemption',
        resourceId: confirmation,
        result: 'partial_failure',
        reason: note || 'Obligation synchronization failed after the redemption update.',
        beforeSummary: { status: entry.data.status, batchId: entry.data.batchId || '' },
        afterSummary: { status: updated.status, batchId: updated.batchId || '', reconciliationRequired: true }
      }
    };
  }

  return {
    response: json({ updated }),
    audit: {
      resourceType: 'give_one_redemption',
      resourceId: confirmation,
      reason: note,
      beforeSummary: { status: entry.data.status, batchId: entry.data.batchId || '' },
      afterSummary: { status: updated.status, batchId: updated.batchId || '', obligationSynchronized: true }
    }
  };
});
