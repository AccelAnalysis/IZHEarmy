import { getStore } from '@netlify/blobs';
import { randomToken } from './admin-crypto.mjs';

const STATE_STORE = 'izhe-accountability-period-state';
const EVENT_STORE = 'izhe-accountability-period-events';
const states = () => getStore(STATE_STORE);
const events = () => getStore(EVENT_STORE);

export function normalizeReportingPeriod(value) {
  const text = String(value || '').trim();
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(text)) return text;
  const date = new Date(text);
  if (!Number.isFinite(date.getTime())) {
    throw Object.assign(new Error('A valid reporting period or effective date is required.'), { statusCode: 400 });
  }
  return date.toISOString().slice(0, 7);
}

function publicPeriod(record) {
  if (!record) return null;
  return {
    period: record.period,
    status: record.status === 'locked' ? 'locked' : 'open',
    lockedAt: record.lockedAt || null,
    lockedBy: record.lockedBy || null,
    unlockedAt: record.unlockedAt || null,
    unlockedBy: record.unlockedBy || null,
    lastReason: record.lastReason || '',
    lastEventId: record.lastEventId || null,
    updatedAt: record.updatedAt || null,
    revision: Number(record.revision || 0)
  };
}

export async function getReportingPeriod(value) {
  const period = normalizeReportingPeriod(value);
  const record = await states().get(`${period}.json`, { type: 'json', consistency: 'strong' }).catch(() => null);
  return record ? publicPeriod(record) : { period, status: 'open', lockedAt: null, lockedBy: null, unlockedAt: null, unlockedBy: null, lastReason: '', lastEventId: null, updatedAt: null, revision: 0 };
}

export async function listReportingPeriods({ limit = 120 } = {}) {
  const listed = await states().list();
  const rows = [];
  for (const blob of listed.blobs || []) {
    const record = await states().get(blob.key, { type: 'json', consistency: 'strong' }).catch(() => null);
    if (record?.period) rows.push(publicPeriod(record));
  }
  rows.sort((a, b) => b.period.localeCompare(a.period));
  return rows.slice(0, Math.min(240, Math.max(1, Number(limit || 120))));
}

export async function assertReportingPeriodOpen(effectiveAt) {
  const period = normalizeReportingPeriod(effectiveAt);
  const state = await getReportingPeriod(period);
  if (state.status === 'locked') {
    throw Object.assign(new Error(`The ${period} accountability reporting period is locked.`), {
      statusCode: 409,
      code: 'reporting_period_locked',
      period
    });
  }
  return state;
}

export async function changeReportingPeriod({ period: inputPeriod, action, reason, expectedRevision, context }) {
  const period = normalizeReportingPeriod(inputPeriod);
  const nextStatus = action === 'unlock' ? 'open' : action === 'lock' ? 'locked' : '';
  if (!nextStatus) throw Object.assign(new Error('Reporting-period action must be lock or unlock.'), { statusCode: 400 });
  const key = `${period}.json`;
  const currentEntry = await states().getWithMetadata(key, { type: 'json', consistency: 'strong' }).catch(() => null);
  const current = currentEntry?.data || {
    period,
    status: 'open',
    revision: 0,
    lockedAt: null,
    lockedBy: null,
    unlockedAt: null,
    unlockedBy: null,
    lastReason: '',
    lastEventId: null,
    updatedAt: null
  };
  if (expectedRevision !== undefined && expectedRevision !== null && Number(expectedRevision) !== Number(current.revision || 0)) {
    throw Object.assign(new Error('The reporting period changed in another session. Reload before retrying.'), { statusCode: 409 });
  }
  if (current.status === nextStatus) {
    throw Object.assign(new Error(`The ${period} reporting period is already ${nextStatus}.`), { statusCode: 409 });
  }

  const timestamp = new Date().toISOString();
  const event = {
    eventId: `period_${randomToken(18)}`,
    period,
    action,
    previousStatus: current.status === 'locked' ? 'locked' : 'open',
    nextStatus,
    reason: String(reason || '').slice(0, 1_000),
    actorUserId: context.userId,
    actorEmail: context.email,
    actorDisplayName: context.displayName,
    actorRoles: [...context.roles],
    timestamp,
    previousEventId: current.lastEventId || null
  };
  const eventKey = `${period}/${timestamp.replace(/[:.]/g, '-')}_${event.eventId}.json`;
  const eventSaved = await events().setJSON(eventKey, event, { onlyIfNew: true });
  if (!eventSaved.modified) throw Object.assign(new Error('A unique reporting-period event could not be recorded.'), { statusCode: 409 });

  const next = {
    ...current,
    period,
    status: nextStatus,
    lockedAt: nextStatus === 'locked' ? timestamp : current.lockedAt,
    lockedBy: nextStatus === 'locked' ? context.userId : current.lockedBy,
    unlockedAt: nextStatus === 'open' ? timestamp : current.unlockedAt,
    unlockedBy: nextStatus === 'open' ? context.userId : current.unlockedBy,
    lastReason: event.reason,
    lastEventId: event.eventId,
    updatedAt: timestamp,
    revision: Number(current.revision || 0) + 1
  };
  const saved = currentEntry?.etag
    ? await states().setJSON(key, next, { onlyIfMatch: currentEntry.etag })
    : await states().setJSON(key, next, { onlyIfNew: true });
  if (!saved.modified) {
    // The immutable event remains as evidence of the failed concurrent attempt.
    throw Object.assign(new Error('The reporting period changed in another session. The rejected event remains in immutable history.'), { statusCode: 409 });
  }
  return { before: publicPeriod(current), period: publicPeriod(next), event };
}

export async function listReportingPeriodEvents({ period = '', limit = 200 } = {}) {
  const prefix = period ? `${normalizeReportingPeriod(period)}/` : '';
  const listed = await events().list({ prefix });
  const rows = [];
  for (const blob of listed.blobs || []) {
    const event = await events().get(blob.key, { type: 'json', consistency: 'strong' }).catch(() => null);
    if (event?.eventId) rows.push(event);
  }
  rows.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  return rows.slice(0, Math.min(1_000, Math.max(1, Number(limit || 200))));
}
