import { requireAdmin } from './_shared/admin-auth.mjs';
import { appendLedgerEntry, listLedgerEntries } from './_shared/accountability-service.mjs';
import { organizationAccountability } from './_shared/accountability-rules.mjs';
import { listCampaigns, listStoreJSON } from './_shared/campaign-service.mjs';
import { json, methodNotAllowed } from './_shared/http.mjs';

export default async (request) => {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const payload = await request.json();
    const [campaigns, orders, codes, redemptions, batches, ledger] = await Promise.all([
      listCampaigns(),
      listStoreJSON('izhe-orders'),
      listStoreJSON('izhe-give-codes'),
      listStoreJSON('izhe-redemptions'),
      listStoreJSON('izhe-production-batches'),
      listLedgerEntries()
    ]);
    const accountability = organizationAccountability(campaigns, { orders, codes, redemptions, batches }, ledger);
    const input = payload.entry || {};
    const target = input.campaignId ? accountability.campaigns.find((item) => item.campaignId === input.campaignId) : accountability.general;
    const amount = Math.round(Number(input.amount || 0));
    if (input.type === 'support_payment' && amount > Math.max(0, Number(target?.supportOutstanding || 0))) {
      return json({ error: 'This payment exceeds the currently outstanding ministry-support balance.' }, 409);
    }
    if (input.type === 'payment_reversal' && amount > Math.max(0, Number(target?.supportPaid || 0))) {
      return json({ error: 'This payment reversal exceeds the support payments currently recorded.' }, 409);
    }
    if (input.type === 'cost_reversal' && amount > Math.max(0, Number(target?.campaignCosts || 0))) {
      return json({ error: 'This cost reversal exceeds the costs currently recorded.' }, 409);
    }
    const entry = await appendLedgerEntry(input, campaigns);
    return json({ entry }, 201);
  } catch (error) {
    console.error('admin-save-ledger-entry', error);
    return json({ error: error.message || 'The ledger entry could not be recorded.' }, error.statusCode || 400);
  }
};
