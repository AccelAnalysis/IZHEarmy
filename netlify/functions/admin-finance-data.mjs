import { requireAdmin } from './_shared/admin-auth.mjs';
import { listCampaigns, listStoreJSON } from './_shared/campaign-service.mjs';
import { listLedgerEntries } from './_shared/accountability-service.mjs';
import { organizationAccountability, LEDGER_TYPES, SETTLEMENT_STATUSES } from './_shared/accountability-rules.mjs';
import { json, methodNotAllowed } from './_shared/http.mjs';

export default async (request) => {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const [campaigns, orders, codes, redemptions, batches, ledger] = await Promise.all([
      listCampaigns(),
      listStoreJSON('izhe-orders'),
      listStoreJSON('izhe-give-codes'),
      listStoreJSON('izhe-redemptions'),
      listStoreJSON('izhe-production-batches'),
      listLedgerEntries()
    ]);
    return json({ ...organizationAccountability(campaigns, { orders, codes, redemptions, batches }, ledger), ledgerTypes: LEDGER_TYPES, settlementStatuses: SETTLEMENT_STATUSES }, 200, { 'cache-control': 'no-store' });
  } catch (error) {
    console.error('admin-finance-data', error);
    return json({ error: 'Financial accountability data could not be loaded.' }, 500);
  }
};
