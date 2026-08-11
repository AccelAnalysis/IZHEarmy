import { requireAdmin } from './_shared/admin-auth.mjs';
import { appendLedgerEntry } from './_shared/accountability-service.mjs';
import { organizationAccountability } from './_shared/accountability-rules.mjs';
import { listCampaigns, listStoreJSON } from './_shared/campaign-service.mjs';
import { json, methodNotAllowed } from './_shared/http.mjs';

export default async (request) => {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const payload = await request.json();
    const input = { ...(payload.entry || {}) };
    input.idempotencyKey = String(input.idempotencyKey || request.headers.get('idempotency-key') || '').trim();
    if (!input.idempotencyKey) return json({ error: 'A stable idempotency key is required for every ledger action.' }, 400);
    input.actorType = 'admin-token';
    input.source = 'admin';
    const campaigns = await listCampaigns();
    const entry = await appendLedgerEntry(input, campaigns, {
      validateWithinLease: async (candidate, currentLedger) => {
        const [orders, codes, redemptions, batches] = await Promise.all([
          listStoreJSON('izhe-orders', 10000),
          listStoreJSON('izhe-give-codes', 10000),
          listStoreJSON('izhe-redemptions', 10000),
          listStoreJSON('izhe-production-batches', 10000)
        ]);
        const accountability = organizationAccountability(campaigns, { orders, codes, redemptions, batches }, currentLedger);
        const target = candidate.campaignId ? accountability.campaigns.find((item) => item.campaignId === candidate.campaignId) : accountability.general;
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
    return json({ entry }, 201);
  } catch (error) {
    console.error('admin-save-ledger-entry', String(error?.message || error).slice(0, 500));
    return json({ error: error.message || 'The ledger entry could not be recorded.' }, error.statusCode || 400);
  }
};
