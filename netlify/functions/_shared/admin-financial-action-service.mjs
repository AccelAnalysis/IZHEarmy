import { getStore } from '@netlify/blobs';
import { randomToken, redact, sha256 } from './admin-crypto.mjs';
import { activeOwners } from './admin-user-service.mjs';

const STORE_NAME = 'izhe-admin-financial-actions';
const store = () => getStore(STORE_NAME);
const ALLOWED_TYPES = new Set(['payment_reconciliation', 'refund_allocation', 'reporting_period_change']);
const now = () => new Date().toISOString();

function safePayload(value) {
  try {
    return structuredClone(value || {});
  } catch {
    throw Object.assign(new Error('The financial action payload is invalid.'), { statusCode: 400 });
  }
}

function publicRecord(record) {
  if (!record) return null;
  return {
    id: record.id,
    type: record.type,
    status: record.status,
    resourceId: record.resourceId,
    requestedAt: record.requestedAt,
    requestedBy: record.requestedBy,
    requestedByEmail: record.requestedByEmail,
    requestedByDisplayName: record.requestedByDisplayName,
    requestedByRoles: record.requestedByRoles,
    requestReason: record.requestReason,
    expectedUpdatedAt: record.expectedUpdatedAt,
    previewSummary: record.previewSummary,
    reviewedAt: record.reviewedAt,
    reviewedBy: record.reviewedBy,
    reviewedByEmail: record.reviewedByEmail,
    reviewedByDisplayName: record.reviewedByDisplayName,
    reviewReason: record.reviewReason,
    sameActorOverride: Boolean(record.sameActorOverride),
    appliedAt: record.appliedAt,
    resultSummary: record.resultSummary,
    failureSummary: record.failureSummary,
    updatedAt: record.updatedAt
  };
}

export async function createFinancialActionRequest({
  type,
  resourceId,
  actionPayload,
  expectedUpdatedAt = '',
  previewSummary = null,
  reason,
  context
}) {
  if (!ALLOWED_TYPES.has(type)) throw Object.assign(new Error('Unsupported financial action type.'), { statusCode: 400 });
  const requestedAt = now();
  const record = {
    id: `fin_${randomToken(18)}`,
    type,
    status: 'pending',
    resourceId: String(resourceId || '').slice(0, 240),
    actionPayload: safePayload(actionPayload),
    expectedUpdatedAt: String(expectedUpdatedAt || '').slice(0, 100),
    previewSummary: redact(previewSummary, { maxDepth: 8 }),
    requestedAt,
    requestedBy: context.userId,
    requestedByEmail: context.email,
    requestedByDisplayName: context.displayName,
    requestedByRoles: [...context.roles],
    requestReason: String(reason || '').slice(0, 1_000),
    reviewedAt: null,
    reviewedBy: null,
    reviewedByEmail: null,
    reviewedByDisplayName: null,
    reviewReason: '',
    sameActorOverride: false,
    reviewTokenHash: null,
    claimExpiresAt: null,
    appliedAt: null,
    resultSummary: null,
    failureSummary: null,
    updatedAt: requestedAt
  };
  const saved = await store().setJSON(record.id, record, { onlyIfNew: true });
  if (!saved.modified) throw Object.assign(new Error('A unique financial action request could not be created.'), { statusCode: 409 });
  return publicRecord(record);
}

export async function getFinancialActionRequest(id) {
  const value = await store().get(String(id || ''), { type: 'json', consistency: 'strong' }).catch(() => null);
  return publicRecord(value);
}

export async function listFinancialActionRequests({ status = '', type = '', limit = 100 } = {}) {
  const listed = await store().list();
  const rows = [];
  for (const blob of listed.blobs || []) {
    const value = await store().get(blob.key, { type: 'json', consistency: 'strong' }).catch(() => null);
    if (!value?.id) continue;
    if (status && value.status !== status) continue;
    if (type && value.type !== type) continue;
    rows.push(publicRecord(value));
  }
  rows.sort((a, b) => String(b.updatedAt || b.requestedAt).localeCompare(String(a.updatedAt || a.requestedAt)));
  return rows.slice(0, Math.min(500, Math.max(1, Number(limit || 100))));
}

export async function beginFinancialActionReview(id, context, {
  reason,
  confirmSameActor = false
} = {}) {
  const entry = await store().getWithMetadata(String(id || ''), { type: 'json', consistency: 'strong' }).catch(() => null);
  if (!entry?.data) throw Object.assign(new Error('Financial action request not found.'), { statusCode: 404 });
  const record = entry.data;
  if (record.status !== 'pending') throw Object.assign(new Error('Only a pending financial action request can be applied.'), { statusCode: 409 });
  const sameActor = record.requestedBy === context.userId;
  if (sameActor) {
    const owners = await activeOwners();
    const soleOwnerOverride = context.roles.includes('owner') && owners.length === 1 && owners[0].id === context.userId && confirmSameActor === true;
    if (!soleOwnerOverride) {
      throw Object.assign(new Error('The requester cannot approve this financial action unless they are the sole active Owner and explicitly confirm the override.'), { statusCode: 403 });
    }
  }
  const reviewToken = randomToken(24);
  const applying = {
    ...record,
    status: 'applying',
    reviewedAt: now(),
    reviewedBy: context.userId,
    reviewedByEmail: context.email,
    reviewedByDisplayName: context.displayName,
    reviewReason: String(reason || '').slice(0, 1_000),
    sameActorOverride: sameActor,
    reviewTokenHash: sha256(reviewToken),
    claimExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    updatedAt: now()
  };
  const saved = await store().setJSON(record.id, applying, { onlyIfMatch: entry.etag });
  if (!saved.modified) throw Object.assign(new Error('The financial action request changed in another session.'), { statusCode: 409 });
  return {
    record: structuredClone(applying),
    request: publicRecord(applying),
    reviewToken
  };
}

async function finish(id, reviewToken, changes) {
  const entry = await store().getWithMetadata(String(id || ''), { type: 'json', consistency: 'strong' }).catch(() => null);
  if (!entry?.data) throw Object.assign(new Error('Financial action request not found.'), { statusCode: 404 });
  if (entry.data.status !== 'applying' || entry.data.reviewTokenHash !== sha256(reviewToken)) {
    throw Object.assign(new Error('The financial action claim is no longer valid.'), { statusCode: 409 });
  }
  const updated = {
    ...entry.data,
    ...changes,
    reviewTokenHash: null,
    claimExpiresAt: null,
    updatedAt: now()
  };
  const saved = await store().setJSON(updated.id, updated, { onlyIfMatch: entry.etag });
  if (!saved.modified) throw Object.assign(new Error('The financial action result changed in another session.'), { statusCode: 409 });
  return publicRecord(updated);
}

export async function completeFinancialActionReview(id, reviewToken, resultSummary) {
  return finish(id, reviewToken, {
    status: 'applied',
    appliedAt: now(),
    resultSummary: redact(resultSummary, { maxDepth: 8 }),
    failureSummary: null
  });
}

export async function failFinancialActionReview(id, reviewToken, error, { partial = false } = {}) {
  return finish(id, reviewToken, {
    status: partial ? 'partial_failure' : 'failed',
    appliedAt: partial ? now() : null,
    failureSummary: {
      message: String(error?.message || 'Financial action failed.').slice(0, 500),
      code: String(error?.code || '').slice(0, 120),
      partial
    }
  });
}

export async function rejectFinancialActionRequest(id, context, reason) {
  const entry = await store().getWithMetadata(String(id || ''), { type: 'json', consistency: 'strong' }).catch(() => null);
  if (!entry?.data) throw Object.assign(new Error('Financial action request not found.'), { statusCode: 404 });
  if (entry.data.status !== 'pending') throw Object.assign(new Error('Only a pending financial action request can be rejected.'), { statusCode: 409 });
  const updated = {
    ...entry.data,
    status: 'rejected',
    reviewedAt: now(),
    reviewedBy: context.userId,
    reviewedByEmail: context.email,
    reviewedByDisplayName: context.displayName,
    reviewReason: String(reason || '').slice(0, 1_000),
    updatedAt: now()
  };
  const saved = await store().setJSON(updated.id, updated, { onlyIfMatch: entry.etag });
  if (!saved.modified) throw Object.assign(new Error('The financial action request changed in another session.'), { statusCode: 409 });
  return publicRecord(updated);
}
