import { getStore } from '@netlify/blobs';
import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import { readJsonBody, requiredExplanation } from './_shared/admin-request.mjs';
import { appendStatusHistory } from './_shared/operations-rules.mjs';
import {
  appendFulfillmentHistory,
  legacyFulfillmentSnapshot,
  resolvePickupHandoffTransition
} from './_shared/fulfillment-rules.mjs';
import { cleanText, json } from './_shared/http.mjs';

export default adminEndpoint({
  methods: ['POST'],
  permission: 'operations.pickup.write',
  csrf: true,
  recentAuth: false,
  auditAction: 'pickup.order.update',
  rateClass: 'write',
  contentTypes: ['application/json'],
  maxBodyBytes: 100_000
}, async (request, context) => {
  const payload = await readJsonBody(request);
  const sessionId = cleanText(payload.sessionId, 180);
  const action = cleanText(payload.action || 'picked_up', 40);
  if (!sessionId) throw Object.assign(new Error('Order reference is required.'), { statusCode: 400 });

  const store = getStore('izhe-orders');
  const entry = await store.getWithMetadata(sessionId, { type: 'json', consistency: 'strong' });
  if (!entry) throw Object.assign(new Error('Order not found.'), { statusCode: 404 });
  if (payload.expectedUpdatedAt && entry.data.updatedAt !== payload.expectedUpdatedAt) {
    throw Object.assign(new Error('This order changed in another session. Refresh and retry.'), { statusCode: 409 });
  }

  const currentFulfillment = legacyFulfillmentSnapshot(entry.data);
  if (currentFulfillment.mode !== 'church_batch') {
    throw Object.assign(new Error('Pickup handoff applies only to church-pickup orders.'), { statusCode: 400 });
  }
  let note = cleanText(payload.note, 1_000);
  const releasedBy = cleanText(payload.releasedBy, 160);
  const recipientName = cleanText(payload.recipientName, 160);
  if (['reverse_pickup', 'exception', 'no_show'].includes(action)) note = requiredExplanation(note);

  const now = new Date().toISOString();
  let handoff = entry.data.pickupHandoff || {};
  let transition;
  try {
    transition = resolvePickupHandoffTransition({
      currentStatus: currentFulfillment.status,
      orderStatus: entry.data.status,
      action,
      note,
      releasedBy
    });
  } catch (error) {
    const conflict = /already|Only|must be reversed/.test(error.message);
    throw Object.assign(error, { statusCode: conflict ? 409 : 400 });
  }

  const status = transition.orderStatus;
  const fulfillmentStatus = transition.fulfillmentStatus;
  if (action === 'picked_up') {
    handoff = {
      pickedUpAt: now,
      releasedBy,
      recipientName: recipientName || entry.data.customerName || '',
      note,
      recordedByAdministratorId: context.userId,
      correctionHistory: handoff.correctionHistory || []
    };
  } else if (action === 'reverse_pickup') {
    handoff = {
      ...handoff,
      correctionHistory: [
        ...(handoff.correctionHistory || []),
        {
          at: now,
          actorAdministratorId: context.userId,
          releasedBy,
          note,
          previousPickedUpAt: handoff.pickedUpAt || ''
        }
      ].slice(-50),
      pickedUpAt: '',
      releasedBy: '',
      recipientName: '',
      reversedByAdministratorId: context.userId
    };
  } else {
    handoff = {
      ...handoff,
      exceptionAt: now,
      exceptionType: action,
      exceptionNote: note,
      releasedBy: releasedBy || handoff.releasedBy || '',
      exceptionRecordedByAdministratorId: context.userId
    };
  }

  const actor = `admin:${context.userId}`;
  const updated = {
    ...entry.data,
    status,
    fulfillment: appendFulfillmentHistory(currentFulfillment, fulfillmentStatus, note, actor, now),
    pickupHandoff: handoff,
    statusHistory: appendStatusHistory(entry.data, status, note, actor),
    updatedAt: now,
    lastAdministrativeActorId: context.userId
  };
  const result = await store.setJSON(sessionId, updated, { onlyIfMatch: entry.etag });
  if (!result.modified) {
    throw Object.assign(new Error('This order changed in another session. Refresh and retry.'), { statusCode: 409 });
  }
  return {
    response: json({ order: updated }),
    audit: {
      resourceType: 'church_pickup_order',
      resourceId: sessionId,
      reason: note,
      beforeSummary: {
        status: entry.data.status,
        fulfillmentStatus: currentFulfillment.status,
        pickedUpAt: entry.data.pickupHandoff?.pickedUpAt || null
      },
      afterSummary: {
        action,
        status: updated.status,
        fulfillmentStatus,
        pickedUpAt: updated.pickupHandoff?.pickedUpAt || null,
        releasedByPresent: Boolean(releasedBy)
      }
    }
  };
});
