import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import { listCampaigns, listStoreJSON } from './_shared/campaign-service.mjs';
import { listLedgerEntries } from './_shared/accountability-service.mjs';
import { organizationAccountability, LEDGER_TYPES, SETTLEMENT_STATUSES } from './_shared/accountability-rules.mjs';
import { normalizeLegacyPayment } from './_shared/payment-rules.mjs';
import { json } from './_shared/http.mjs';

function paymentIntegrityOrder(order) {
  const payment = order.payment || normalizeLegacyPayment(order);
  return {
    sessionId: order.sessionId,
    campaignId: order.campaignId || '',
    updatedAt: order.updatedAt || '',
    paymentStatus: payment.captureStatus,
    refundStatus: payment.refundStatus,
    disputeStatus: payment.disputeStatus,
    reconciliationStatus: payment.reconciliationStatus,
    currency: payment.currency || 'usd',
    amounts: payment.amounts,
    lastStripeEventAt: payment.lastStripeEventAt || '',
    lastReconciledAt: payment.lastReconciledAt || '',
    refundCount: (payment.refundReferences || []).length,
    disputeCount: (payment.disputeReferences || []).length,
    unresolvedAllocationAmount: (order.lineSettlements || []).reduce((sum, line) => sum + Number(line.unresolvedAllocationAmount || 0), 0),
    fulfillmentMode: order.fulfillment?.mode || 'individual_shipping',
    fulfillmentStatus: order.fulfillment?.status || '',
    productionAssignmentCount: (order.batchAssignments || []).length
  };
}

export default adminEndpoint({
  methods: ['GET'],
  permission: 'accountability.read',
  csrf: false,
  recentAuth: false,
  auditAction: 'accountability.read',
  rateClass: 'read'
}, async () => {
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
  const accountability = organizationAccountability(campaigns, records, ledger);
  const paymentIntegrityOrders = [...orders]
    .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))
    .slice(0, 50)
    .map(paymentIntegrityOrder);
  return json({
    ...accountability,
    ledgerTypes: LEDGER_TYPES,
    settlementStatuses: SETTLEMENT_STATUSES,
    paymentIntegrityOrders,
    paymentIntegrityHasMore: orders.length > paymentIntegrityOrders.length,
    reconciliationQueue: reconciliationTasks.filter((task) => task.state !== 'resolved').slice(0, 100).map((task) => ({
      id: task.id,
      state: task.state,
      type: task.type,
      orderId: task.orderId || task.sessionId || '',
      createdAt: task.createdAt,
      updatedAt: task.updatedAt
    })),
    stripeEventSummary: {
      received: stripeEvents.length,
      failedRetryable: stripeEvents.filter((event) => event.processingState === 'failed_retryable').length,
      reconciliationRequired: stripeEvents.filter((event) => event.processingState === 'reconciliation_required').length
    },
    projectionsMinimized: true,
    listEndpoint: '/.netlify/functions/admin-list?resource=accountability',
    detailEndpoint: '/.netlify/functions/admin-detail'
  });
});
