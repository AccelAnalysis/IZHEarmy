import { requireAdmin } from './_shared/admin-auth.mjs';
import { listCampaigns, listStoreJSON } from './_shared/campaign-service.mjs';
import { listLedgerEntries } from './_shared/accountability-service.mjs';
import { organizationAccountability, LEDGER_TYPES, SETTLEMENT_STATUSES } from './_shared/accountability-rules.mjs';
import { normalizeLegacyPayment } from './_shared/payment-rules.mjs';
import { json, methodNotAllowed } from './_shared/http.mjs';

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
    refundReferences: (payment.refundReferences || []).map((item) => ({ id: item.id, amount: item.amount, status: item.status, createdAt: item.createdAt || '' })),
    disputeReferences: (payment.disputeReferences || []).map((item) => ({ id: item.id, amount: item.amount, status: item.status, createdAt: item.createdAt || '' })),
    lineSettlements: (order.lineSettlements || []).map((line) => ({
      lineId: line.lineId,
      productId: line.productId,
      productName: line.productSnapshot?.name || '',
      variant: [line.variantSnapshot?.fit, line.variantSnapshot?.size, line.variantSnapshot?.color].filter(Boolean).join(' · '),
      quantityPurchased: line.quantityPurchased,
      grossMerchandiseAmount: line.grossMerchandiseAmount,
      allocatedDiscount: line.allocatedDiscount,
      netMerchandiseBeforeRefunds: line.netMerchandiseBeforeRefunds,
      allocatedMerchandiseRefund: line.allocatedMerchandiseRefund,
      allocatedWholeUnitReversals: line.allocatedWholeUnitReversals || [],
      unresolvedAllocationAmount: line.unresolvedAllocationAmount || 0,
      supportEligible: Boolean(line.supportEligible),
      giveOneEligible: Boolean(line.giveOneEligible)
    })),
    refundAllocationHistory: (order.refundAllocationHistory || []).map((entry) => ({
      id: entry.id, kind: entry.kind, reversalOf: entry.reversalOf || '', sourceRefundId: entry.sourceRefundId || '', effectiveAt: entry.effectiveAt, createdAt: entry.createdAt,
      actorType: entry.actorType, note: entry.note, lineAllocations: entry.lineAllocations || [], shippingAmount: entry.shippingAmount || 0, taxAmount: entry.taxAmount || 0, unallocatedAmount: entry.unallocatedAmount || 0
    })),
    fulfillmentMode: order.fulfillment?.mode || 'individual_shipping',
    fulfillmentStatus: order.fulfillment?.status || '',
    productionAssignments: (order.batchAssignments || []).map((item) => ({ batchId: item.batchId, batchStatus: item.batchStatus, sourceItemId: item.sourceItemId, paymentLineId: item.paymentLineId || '', quantity: item.quantity }))
  };
}

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
      paymentIntegrityOrders: orders.map(paymentIntegrityOrder),
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
