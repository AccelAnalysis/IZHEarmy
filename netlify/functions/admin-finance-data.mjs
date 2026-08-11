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
    const [campaigns, orders, codes, obligations, redemptions, batches, ledger, reconciliationTasks, stripeEvents, workflows] = await Promise.all([
      listCampaigns(),
      listStoreJSON('izhe-orders', 10000),
      listStoreJSON('izhe-give-codes', 10000),
      listStoreJSON('izhe-give-obligations', 10000),
      listStoreJSON('izhe-redemptions', 10000),
      listStoreJSON('izhe-production-batches', 10000),
      listLedgerEntries(),
      listStoreJSON('izhe-reconciliation-tasks', 10000),
      listStoreJSON('izhe-stripe-events', 10000),
      listStoreJSON('izhe-order-workflows', 10000)
    ]);
    const records = { orders, codes, obligations, redemptions, batches, reconciliationTasks, stripeEvents, workflows };
    return json({
      ...organizationAccountability(campaigns, records, ledger),
      ledgerTypes: LEDGER_TYPES,
      settlementStatuses: SETTLEMENT_STATUSES,
      reconciliationQueue: reconciliationTasks.filter((task) => task.state !== 'resolved'),
      stripeEventSummary: {
        received: stripeEvents.length,
        failedRetryable: stripeEvents.filter((event) => event.processingState === 'failed_retryable').length,
        reconciliationRequired: stripeEvents.filter((event) => event.processingState === 'reconciliation_required').length
      }
    }, 200, { 'cache-control': 'no-store' });
  } catch (error) {
    console.error('admin-finance-data', String(error?.message || error).slice(0, 500));
    return json({ error: 'Financial accountability data could not be loaded.' }, 500);
  }
};
