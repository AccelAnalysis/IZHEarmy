import { getStore } from '@netlify/blobs';
import { appendLedgerEntry } from './accountability-service.mjs';
import { organizationAccountability, validateLedgerEntry } from './accountability-rules.mjs';
import { randomToken } from './admin-crypto.mjs';
import { listCampaigns, listStoreJSON } from './campaign-service.mjs';

const STORE_NAME = 'izhe-accountability-approvals';
const store = () => getStore(STORE_NAME);
const now = () => new Date().toISOString();

async function operationalRecords() {
  const [orders, codes, redemptions, batches] = await Promise.all([
    listStoreJSON('izhe-orders', 10_000),
    listStoreJSON('izhe-give-codes', 10_000),
    listStoreJSON('izhe-redemptions', 10_000),
    listStoreJSON('izhe-production-batches', 10_000)
  ]);
  return { orders, codes, redemptions, batches };
}

async function appendValidated(input, campaigns) {
  return appendLedgerEntry(input, campaigns, {
    validateWithinLease: async (candidate, currentLedger) => {
      const records = await operationalRecords();
      const accountability = organizationAccountability(campaigns, records, currentLedger);
      const target = candidate.campaignId
        ? accountability.campaigns.find((item) => item.campaignId === candidate.campaignId)
        : accountability.general;
      const amount = Math.round(Number(candidate.amount || 0));
      if (candidate.type === 'support_payment' && amount > Math.max(0, Number(target?.supportOutstanding || 0))) {
        throw Object.assign(new Error('This payment exceeds the currently available outstanding ministry-support balance.'), { statusCode: 409 });
      }
      if (candidate.type === 'payment_reversal' && amount > Math.max(0, Number(target?.supportPaid || 0))) {
        throw Object.assign(new Error('This payment reversal exceeds the support payments currently recorded.'), { statusCode: 409 });
      }
      if (candidate.type === 'cost_reversal' && amount > Math.max(0, Number(target?.campaignCosts || 0))) {
        throw Object.assign(new Error('This cost reversal exceeds the costs currently recorded.'), { statusCode: 409 });
      }
    }
  });
}

export async function createAccountabilityApprovalRequest(input, context, reason) {
  const campaigns = await listCampaigns();
  const normalized = validateLedgerEntry({
    ...(input || {}),
    id: '',
    idempotencyKey: String(input?.idempotencyKey || `accountability-request-${randomToken(18)}`),
    actorType: 'admin-user',
    source: 'admin-v2'
  }, campaigns);
  const createdAt = now();
  const request = {
    id: `AAR_${randomToken(18)}`,
    status: 'pending',
    requestedAt: createdAt,
    requestedBy: context.userId,
    requestedByEmail: context.email,
    requestedByDisplayName: context.displayName,
    requestedByRoles: [...context.roles],
    reason: String(reason || '').slice(0, 1_000),
    entry: normalized,
    reviewedAt: null,
    reviewedBy: null,
    reviewReason: '',
    ledgerEntryId: null,
    updatedAt: createdAt
  };
  const saved = await store().setJSON(request.id, request, { onlyIfNew: true });
  if (!saved.modified) throw Object.assign(new Error('The accountability request could not be created.'), { statusCode: 409 });
  return request;
}

export async function getAccountabilityApprovalRequest(id) {
  return store().get(String(id || ''), { type: 'json', consistency: 'strong' }).catch(() => null);
}

export async function listAccountabilityApprovalRequests({ status = '', limit = 100 } = {}) {
  const listed = await store().list();
  const rows = [];
  for (const blob of listed.blobs || []) {
    const value = await store().get(blob.key, { type: 'json', consistency: 'strong' }).catch(() => null);
    if (!value?.id) continue;
    if (status && value.status !== status) continue;
    rows.push(value);
  }
  rows.sort((a, b) => String(b.updatedAt || b.requestedAt).localeCompare(String(a.updatedAt || a.requestedAt)));
  return rows.slice(0, Math.min(500, Math.max(1, Number(limit || 100))));
}

export async function approveAccountabilityRequest(id, context, {
  reason,
  confirmSameActor = false
} = {}) {
  const entry = await store().getWithMetadata(String(id || ''), { type: 'json', consistency: 'strong' });
  if (!entry?.data) throw Object.assign(new Error('Accountability approval request not found.'), { statusCode: 404 });
  const request = entry.data;
  if (request.status !== 'pending') throw Object.assign(new Error('Only a pending accountability request can be approved.'), { statusCode: 409 });
  if (request.requestedBy === context.userId) {
    if (!context.roles.includes('owner') || confirmSameActor !== true) {
      throw Object.assign(new Error('The requester cannot approve the same action unless acting as the sole Owner with explicit confirmation.'), { statusCode: 403 });
    }
  }
  const campaigns = await listCampaigns();
  const ledgerInput = {
    ...request.entry,
    id: '',
    idempotencyKey: request.entry.idempotencyKey || `approved-${request.id}`,
    source: 'admin-v2-approval',
    sourceEventId: request.id,
    actorType: 'admin-user'
  };
  const ledgerEntry = await appendValidated(ledgerInput, campaigns);
  const updated = {
    ...request,
    status: 'approved',
    reviewedAt: now(),
    reviewedBy: context.userId,
    reviewedByEmail: context.email,
    reviewedByDisplayName: context.displayName,
    reviewReason: String(reason || '').slice(0, 1_000),
    ledgerEntryId: ledgerEntry.id,
    updatedAt: now()
  };
  const saved = await store().setJSON(request.id, updated, { onlyIfMatch: entry.etag });
  if (!saved.modified) {
    throw Object.assign(new Error('The ledger entry was appended, but the approval record requires reconciliation. Replay is protected by its idempotency key.'), { statusCode: 500, code: 'approval_record_reconciliation_required', ledgerEntryId: ledgerEntry.id });
  }
  return { request: updated, ledgerEntry };
}

export async function rejectAccountabilityRequest(id, context, reason) {
  const entry = await store().getWithMetadata(String(id || ''), { type: 'json', consistency: 'strong' });
  if (!entry?.data) throw Object.assign(new Error('Accountability approval request not found.'), { statusCode: 404 });
  if (entry.data.status !== 'pending') throw Object.assign(new Error('Only a pending accountability request can be rejected.'), { statusCode: 409 });
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
  if (!saved.modified) throw Object.assign(new Error('The accountability request changed in another session.'), { statusCode: 409 });
  return updated;
}
