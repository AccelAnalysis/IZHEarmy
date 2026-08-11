import { randomUUID } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { validateLedgerEntry } from './accountability-rules.mjs';

const STORE = 'izhe-mission-ledger';
const SCOPE_STORE = 'izhe-mission-ledger-scopes';
const LEASE_MS = 30_000;

const nowIso = () => new Date().toISOString();
const scopeKey = (campaignId) => campaignId ? `campaign:${campaignId}` : 'organization:izhe';

export async function listLedgerEntries(limit = 5000) {
  const store = getStore(STORE);
  const { blobs } = await store.list();
  const entries = [];
  for (const blob of blobs.slice(-limit).reverse()) {
    const value = await store.get(blob.key, { type: 'json', consistency: 'strong' });
    if (value) entries.push(value);
  }
  return entries.sort((a, b) => new Date(b.effectiveAt || b.createdAt) - new Date(a.effectiveAt || a.createdAt));
}

async function acquireScopeLease(campaignId) {
  const store = getStore(SCOPE_STORE);
  const key = scopeKey(campaignId);
  const owner = randomUUID();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await store.getWithMetadata(key, { type: 'json', consistency: 'strong' });
    const now = Date.now();
    const leaseExpiresAt = new Date(now + LEASE_MS).toISOString();
    if (!current?.data) {
      const value = { scope: key, revision: 0, leaseOwner: owner, leaseAcquiredAt: new Date(now).toISOString(), leaseExpiresAt, updatedAt: new Date(now).toISOString() };
      const created = await store.setJSON(key, value, { onlyIfNew: true });
      if (created.modified) return { key, owner, revision: 0 };
      continue;
    }
    const expires = new Date(current.data.leaseExpiresAt || 0).valueOf();
    const active = current.data.leaseOwner && Number.isFinite(expires) && expires > now;
    if (active) throw Object.assign(new Error('Another administrator action is updating this accountability balance. Retry after it completes.'), { statusCode: 409, code: 'ledger_scope_busy' });
    const value = {
      ...current.data,
      leaseOwner: owner,
      leaseAcquiredAt: new Date(now).toISOString(),
      leaseExpiresAt,
      updatedAt: new Date(now).toISOString()
    };
    const replaced = await store.setJSON(key, value, { onlyIfMatch: current.etag });
    if (replaced.modified) return { key, owner, revision: Number(current.data.revision || 0) };
  }
  throw Object.assign(new Error('Accountability balance changed concurrently. Retry the action.'), { statusCode: 409, code: 'ledger_scope_conflict' });
}

async function releaseScopeLease(lease, { advance = false } = {}) {
  const store = getStore(SCOPE_STORE);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await store.getWithMetadata(lease.key, { type: 'json', consistency: 'strong' });
    if (!current?.data || current.data.leaseOwner !== lease.owner) return false;
    const next = {
      ...current.data,
      revision: Number(current.data.revision || 0) + (advance ? 1 : 0),
      leaseOwner: '',
      leaseExpiresAt: '',
      updatedAt: nowIso()
    };
    const saved = await store.setJSON(lease.key, next, { onlyIfMatch: current.etag });
    if (saved.modified) return true;
  }
  return false;
}

export async function appendLedgerEntry(input, campaigns, { validateWithinLease = null } = {}) {
  const entry = validateLedgerEntry(input, campaigns);
  const lease = await acquireScopeLease(entry.campaignId);
  let appended = false;
  try {
    const existing = await listLedgerEntries();
    const duplicateIdempotency = existing.find((item) => item.idempotencyKey && item.idempotencyKey === entry.idempotencyKey);
    if (duplicateIdempotency) throw Object.assign(new Error('This ledger action has already been recorded with the same idempotency key.'), { statusCode: 409, code: 'duplicate_idempotency_key', existingEntryId: duplicateIdempotency.id });
    if (entry.reference) {
      const duplicateReference = existing.find((item) => item.reference?.toLowerCase() === entry.reference.toLowerCase() && item.campaignId === entry.campaignId && item.type === entry.type && Number(item.amount || 0) === entry.amount);
      if (duplicateReference) throw Object.assign(new Error('A matching ledger entry already uses this reference. Review the ledger before recording a duplicate.'), { statusCode: 409, code: 'duplicate_reference_warning' });
    }
    if (validateWithinLease) await validateWithinLease(entry, existing, lease.revision);
    const scopedEntry = { ...entry, scopeRevision: lease.revision + 1 };
    const result = await getStore(STORE).setJSON(scopedEntry.id, scopedEntry, { onlyIfNew: true });
    if (!result.modified) throw Object.assign(new Error('A ledger entry with this ID already exists.'), { statusCode: 409 });
    appended = true;
    const advanced = await releaseScopeLease(lease, { advance: true });
    if (!advanced) throw Object.assign(new Error('Ledger entry was appended, but its accountability scope requires revision reconciliation. The idempotency key prevents duplicate replay.'), { statusCode: 500, code: 'ledger_revision_reconciliation_required' });
    return scopedEntry;
  } catch (error) {
    if (!appended) await releaseScopeLease(lease, { advance: false }).catch(() => false);
    throw error;
  }
}

export async function getLedgerScopeRevision(campaignId = '') {
  const value = await getStore(SCOPE_STORE).get(scopeKey(campaignId), { type: 'json', consistency: 'strong' });
  return Number(value?.revision || 0);
}
