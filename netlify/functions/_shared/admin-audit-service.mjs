import { getStore } from '@netlify/blobs';
import {
  canonicalJson,
  hmac256,
  minimizedIpReference,
  randomToken,
  redact,
  sha256,
  summarizeUserAgent
} from './admin-crypto.mjs';

const STORE_NAME = 'izhe-admin-audit';
const EVENT_PREFIX = 'events/';
const HEAD_KEY = 'chain/head.json';
const LOCK_KEY = 'chain/append-lock.json';
const store = () => getStore(STORE_NAME);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function signingSecret() {
  const secret = process.env.IZHE_ADMIN_AUDIT_SIGNING_SECRET || '';
  if (secret.length < 32) throw Object.assign(new Error('Administrator audit signing configuration is incomplete.'), { statusCode: 503, configurationError: true });
  return secret;
}

function eventKey(timestamp, eventId, sequence) {
  const date = new Date(timestamp);
  const day = Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10).replaceAll('-', '/') : 'invalid';
  return `${EVENT_PREFIX}${day}/${String(sequence).padStart(16, '0')}_${timestamp.replace(/[:.]/g, '-')}_${eventId}.json`;
}

async function acquireLock() {
  const owner = randomToken(18);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const now = Date.now();
    const lock = { owner, acquiredAt: new Date(now).toISOString(), expiresAt: new Date(now + 10_000).toISOString() };
    const created = await store().setJSON(LOCK_KEY, lock, { onlyIfNew: true });
    if (created.modified) return lock;

    const current = await store().getWithMetadata(LOCK_KEY, { type: 'json', consistency: 'strong' }).catch(() => null);
    if (current?.data && Date.parse(current.data.expiresAt || '') <= now) {
      const replaced = await store().setJSON(LOCK_KEY, lock, { onlyIfMatch: current.etag });
      if (replaced.modified) return lock;
    }
    await sleep(25 + attempt * 15);
  }
  throw Object.assign(new Error('Audit history is temporarily busy.'), { statusCode: 503 });
}

async function releaseLock(lock) {
  const current = await store().getWithMetadata(LOCK_KEY, { type: 'json', consistency: 'strong' }).catch(() => null);
  if (current?.data?.owner !== lock.owner) return;
  await store().setJSON(LOCK_KEY, {
    ...current.data,
    releasedAt: new Date().toISOString(),
    expiresAt: new Date(0).toISOString()
  }, { onlyIfMatch: current.etag }).catch(() => null);
}

function actorFrom(context) {
  return {
    actorUserId: context?.userId || null,
    actorEmail: context?.email || null,
    actorDisplayName: context?.displayName || null,
    actorRoles: Array.isArray(context?.roles) ? [...context.roles] : []
  };
}

export async function appendAdminAuditEvent({
  request,
  requestId,
  context,
  action,
  resourceType = 'administration',
  resourceId = null,
  result = 'success',
  reason = '',
  beforeSummary = null,
  afterSummary = null,
  metadata = null
}) {
  const lock = await acquireLock();
  try {
    const headEntry = await store().getWithMetadata(HEAD_KEY, { type: 'json', consistency: 'strong' }).catch(() => null);
    const previousEventHash = headEntry?.data?.eventHash || null;
    const sequence = Math.max(0, Number(headEntry?.data?.sequence || 0)) + 1;
    const timestamp = new Date().toISOString();
    const eventId = `audit_${randomToken(18)}`;
    const safeSessionReference = context?.sessionHash ? sha256(context.sessionHash).slice(0, 24) : null;
    const eventWithoutHash = {
      eventId,
      sequence,
      timestamp,
      requestId: requestId || null,
      ...actorFrom(context),
      sessionReference: safeSessionReference,
      action: String(action || 'administration.unknown').slice(0, 160),
      resourceType: String(resourceType || 'administration').slice(0, 120),
      resourceId: resourceId === null || resourceId === undefined ? null : String(resourceId).slice(0, 240),
      result: String(result || 'unknown').slice(0, 40),
      reason: String(reason || '').slice(0, 1_000),
      beforeSummary: redact(beforeSummary),
      afterSummary: redact(afterSummary),
      metadata: redact(metadata),
      sourceIpHash: request ? minimizedIpReference(request) : null,
      userAgentSummary: request ? summarizeUserAgent(request.headers.get('user-agent')) : null,
      previousEventHash
    };
    const eventHash = hmac256(signingSecret(), canonicalJson(eventWithoutHash));
    const event = { ...eventWithoutHash, eventHash };
    const created = await store().setJSON(eventKey(timestamp, eventId, sequence), event, { onlyIfNew: true });
    if (!created.modified) throw new Error('Audit event ID collision.');
    const head = { eventId, eventHash, timestamp, sequence };
    const updatedHead = headEntry?.etag
      ? await store().setJSON(HEAD_KEY, head, { onlyIfMatch: headEntry.etag })
      : await store().setJSON(HEAD_KEY, head, { onlyIfNew: true });
    if (!updatedHead.modified) throw new Error('Audit chain head changed while appending an event.');
    return event;
  } finally {
    await releaseLock(lock);
  }
}

export async function auditDenied(request, requestId, context, action, reason, metadata = null) {
  return appendAdminAuditEvent({
    request,
    requestId,
    context,
    action,
    resourceType: 'administrative_endpoint',
    result: 'denied',
    reason,
    metadata
  }).catch((error) => {
    console.error('admin-audit-denied-write', { requestId, message: error.message });
    return null;
  });
}

async function allAuditEvents() {
  const listed = await store().list({ prefix: EVENT_PREFIX });
  const rows = [];
  for (const blob of listed.blobs || []) {
    const event = await store().get(blob.key, { type: 'json', consistency: 'strong' }).catch(() => null);
    if (event?.eventId) rows.push(event);
  }
  return rows;
}

export async function listAdminAuditEvents({
  dateFrom = '',
  dateTo = '',
  actorUserId = '',
  action = '',
  resourceType = '',
  resourceId = '',
  result = '',
  beforeSequence = null,
  limit = 50
} = {}) {
  const boundedLimit = Math.min(200, Math.max(1, Number(limit || 50)));
  const rows = [];
  for (const event of await allAuditEvents()) {
    if (dateFrom && event.timestamp < dateFrom) continue;
    if (dateTo && event.timestamp > dateTo) continue;
    if (actorUserId && event.actorUserId !== actorUserId) continue;
    if (action && !String(event.action).includes(action)) continue;
    if (resourceType && event.resourceType !== resourceType) continue;
    if (resourceId && event.resourceId !== resourceId) continue;
    if (result && event.result !== result) continue;
    if (beforeSequence && Number(event.sequence || 0) >= Number(beforeSequence)) continue;
    rows.push(event);
  }
  rows.sort((a, b) => Number(b.sequence || 0) - Number(a.sequence || 0));
  const items = rows.slice(0, boundedLimit);
  const hasMore = rows.length > boundedLimit;
  return {
    items,
    hasMore,
    nextCursor: hasMore && items.length ? String(items.at(-1).sequence) : null
  };
}

export function verifyAuditEvent(event) {
  if (!event?.eventHash) return false;
  const { eventHash, ...withoutHash } = event;
  return eventHash === hmac256(signingSecret(), canonicalJson(withoutHash));
}

export async function verifyAdminAuditChain() {
  const events = await allAuditEvents();
  events.sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0));
  let previous = null;
  let expectedSequence = 1;
  const failures = [];
  for (const event of events) {
    if (!verifyAuditEvent(event)) failures.push({ eventId: event.eventId, reason: 'invalid_hmac' });
    if (Number(event.sequence || 0) !== expectedSequence) failures.push({ eventId: event.eventId, reason: 'invalid_sequence' });
    if (event.previousEventHash !== previous) failures.push({ eventId: event.eventId, reason: 'broken_chain' });
    previous = event.eventHash;
    expectedSequence += 1;
  }
  const head = await store().get(HEAD_KEY, { type: 'json', consistency: 'strong' }).catch(() => null);
  if (events.length && (head?.eventHash !== previous || Number(head?.sequence || 0) !== events.at(-1).sequence)) {
    failures.push({ eventId: head?.eventId || null, reason: 'head_mismatch' });
  }
  return {
    valid: failures.length === 0,
    checkedAt: new Date().toISOString(),
    eventCount: events.length,
    headEventId: head?.eventId || null,
    headSequence: Number(head?.sequence || 0),
    failures
  };
}
