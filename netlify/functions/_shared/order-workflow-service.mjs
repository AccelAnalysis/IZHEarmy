import { randomUUID } from 'node:crypto';
import { getStore } from '@netlify/blobs';

export const ORDER_WORKFLOW_STORE = 'izhe-order-workflows';
export const ORDER_WORKFLOW_LEASE_MS = 60_000;

const nowIso = () => new Date().toISOString();

function leaseExpired(value, now = Date.now()) {
  const expires = new Date(value?.leaseExpiresAt || 0).valueOf();
  return !Number.isFinite(expires) || expires <= now;
}

export async function acquireOrderWorkflow(sessionId, { eventId = '', leaseMs = ORDER_WORKFLOW_LEASE_MS } = {}) {
  const store = getStore(ORDER_WORKFLOW_STORE);
  const ownerAttemptId = randomUUID();
  const now = Date.now();
  const at = new Date(now).toISOString();
  const leaseExpiresAt = new Date(now + leaseMs).toISOString();
  const initial = {
    sessionId,
    ownerAttemptId,
    eventId,
    state: 'processing',
    acquiredAt: at,
    updatedAt: at,
    heartbeatAt: at,
    leaseExpiresAt,
    currentStage: 'received',
    lastCompletedStage: '',
    lastError: '',
    recoveryCount: 0,
    attemptCount: 1
  };
  const created = await store.setJSON(sessionId, initial, { onlyIfNew: true });
  if (created.modified) return initial;
  const current = await store.getWithMetadata(sessionId, { type: 'json', consistency: 'strong' });
  if (!current?.data) throw Object.assign(new Error('Order workflow could not be loaded after lease contention.'), { code: 'workflow_missing' });
  if (current.data.state === 'processing' && !leaseExpired(current.data, now)) {
    throw Object.assign(new Error('Order fulfillment is already in progress.'), { code: 'workflow_active', retryable: true, leaseExpiresAt: current.data.leaseExpiresAt });
  }
  const recovered = {
    ...current.data,
    ownerAttemptId,
    eventId: eventId || current.data.eventId || '',
    state: 'processing',
    acquiredAt: at,
    updatedAt: at,
    heartbeatAt: at,
    leaseExpiresAt,
    lastError: '',
    recoveryCount: Number(current.data.recoveryCount || 0) + (current.data.state === 'processing' ? 1 : 0),
    attemptCount: Number(current.data.attemptCount || 0) + 1
  };
  const replaced = await store.setJSON(sessionId, recovered, { onlyIfMatch: current.etag });
  if (!replaced.modified) throw Object.assign(new Error('Order workflow lease changed concurrently.'), { code: 'workflow_active', retryable: true });
  return recovered;
}

export async function updateOrderWorkflow(sessionId, ownerAttemptId, stage, { completed = false, error = '', leaseMs = ORDER_WORKFLOW_LEASE_MS, fields = {} } = {}) {
  const store = getStore(ORDER_WORKFLOW_STORE);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = await store.getWithMetadata(sessionId, { type: 'json', consistency: 'strong' });
    if (!current?.data) throw Object.assign(new Error('Order workflow is missing.'), { code: 'workflow_missing' });
    if (current.data.ownerAttemptId !== ownerAttemptId) throw Object.assign(new Error('Order workflow lease is owned by another attempt.'), { code: 'workflow_owner_changed', retryable: true });
    const now = Date.now();
    const at = new Date(now).toISOString();
    const next = {
      ...current.data,
      ...fields,
      currentStage: stage,
      lastCompletedStage: completed ? stage : current.data.lastCompletedStage,
      lastError: error ? String(error).slice(0, 500) : '',
      updatedAt: at,
      heartbeatAt: at,
      leaseExpiresAt: new Date(now + leaseMs).toISOString()
    };
    const result = await store.setJSON(sessionId, next, { onlyIfMatch: current.etag });
    if (result.modified) return next;
  }
  throw Object.assign(new Error('Order workflow could not be advanced because it changed concurrently.'), { code: 'workflow_conflict', retryable: true });
}

export async function completeOrderWorkflow(sessionId, ownerAttemptId, fields = {}) {
  const store = getStore(ORDER_WORKFLOW_STORE);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = await store.getWithMetadata(sessionId, { type: 'json', consistency: 'strong' });
    if (!current?.data) return null;
    if (current.data.ownerAttemptId !== ownerAttemptId) throw Object.assign(new Error('Order workflow lease is owned by another attempt.'), { code: 'workflow_owner_changed', retryable: true });
    const at = nowIso();
    const next = {
      ...current.data,
      ...fields,
      state: 'completed',
      currentStage: 'event_completed',
      lastCompletedStage: 'event_completed',
      lastError: '',
      updatedAt: at,
      heartbeatAt: at,
      leaseExpiresAt: at,
      completedAt: at
    };
    const result = await store.setJSON(sessionId, next, { onlyIfMatch: current.etag });
    if (result.modified) return next;
  }
  throw Object.assign(new Error('Order workflow completion conflicted with another write.'), { code: 'workflow_conflict', retryable: true });
}

export async function failOrderWorkflow(sessionId, ownerAttemptId, error, fields = {}) {
  const store = getStore(ORDER_WORKFLOW_STORE);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = await store.getWithMetadata(sessionId, { type: 'json', consistency: 'strong' });
    if (!current?.data || current.data.ownerAttemptId !== ownerAttemptId) return current?.data || null;
    const at = nowIso();
    const next = {
      ...current.data,
      ...fields,
      state: 'failed_retryable',
      lastError: String(error?.message || error || 'Order workflow failed.').slice(0, 500),
      updatedAt: at,
      heartbeatAt: at,
      leaseExpiresAt: at
    };
    const result = await store.setJSON(sessionId, next, { onlyIfMatch: current.etag });
    if (result.modified) return next;
  }
  return null;
}

export async function listStaleOrderWorkflows(limit = 500) {
  const store = getStore(ORDER_WORKFLOW_STORE);
  const { blobs } = await store.list();
  const now = Date.now();
  const results = [];
  for (const blob of blobs.slice(-limit).reverse()) {
    const value = await store.get(blob.key, { type: 'json', consistency: 'strong' });
    if (value?.state === 'failed_retryable' || (value?.state === 'processing' && leaseExpired(value, now))) results.push(value);
  }
  return results;
}
