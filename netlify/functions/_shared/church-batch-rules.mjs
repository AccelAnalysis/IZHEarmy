import { batchProductionSummary } from './operations-rules.mjs';
import { cents, normalizeLegacyPayment } from './payment-rules.mjs';

const PAID_PROGRESS_STATUSES = new Set(['paid', 'allocated', 'in_production', 'ready_for_pickup', 'completed']);
const ACTIVE_BATCH_STATUSES = new Set(['draft', 'ready', 'submitted', 'in_production', 'received', 'completed']);

function paymentFor(order) { return order?.payment || normalizeLegacyPayment(order); }

function hasConfirmedPayment(order) {
  const payment = paymentFor(order);
  if (payment?.captureStatus) return payment.captureStatus === 'paid';
  if (order?.paymentStatus) return order.paymentStatus === 'paid';
  return PAID_PROGRESS_STATUSES.has(order?.status);
}

function paymentReviewReason(order) {
  const payment = paymentFor(order);
  if (order?.status === 'cancelled') return 'cancelled';
  if (payment.captureStatus !== 'paid') return 'not_paid';
  if (payment.refundStatus === 'full') return 'fully_refunded';
  if (payment.refundStatus === 'allocation_required' || payment.reconciliationStatus === 'allocation_required') return 'refund_or_reversal_allocation_required';
  if (payment.disputeStatus === 'open' || payment.disputeStatus === 'review_required') return 'dispute_open';
  const charged = Math.max(0, cents(payment.amounts?.totalCharged));
  const lost = Math.max(0, cents(payment.amounts?.lostDisputeAmount));
  if (charged > 0 && lost >= charged) return 'dispute_lost_full';
  if (['event_unmatched', 'index_repair_required', 'manual_review_required'].includes(payment.reconciliationStatus)) return 'payment_reconciliation_required';
  return '';
}

export function isPaidChurchPickupOrder(order, campaignId = '') {
  if (!order) return false;
  if (campaignId && order.campaignId !== campaignId) return false;
  if (order.fulfillment?.mode !== 'church_batch') return false;
  if (!hasConfirmedPayment(order)) return false;
  if (paymentReviewReason(order)) return false;
  return true;
}

export function stableOrderSourceItems(order) {
  const lines = Array.isArray(order?.lineSettlements) ? order.lineSettlements : [];
  return (order?.items || []).map((item, index) => {
    const line = lines[index] || null;
    const purchased = Math.max(0, Number(line?.quantityPurchased ?? item.quantity ?? 0));
    const reversedWholeUnits = new Set(line?.allocatedWholeUnitReversals || []);
    const remainingQuantity = Math.max(0, purchased - reversedWholeUnits.size);
    // Keep the PR #14 structural source ID for batch backward compatibility; preserve the
    // canonical payment line ID separately so reconciliation can trace the exact settlement line.
    const legacySourceItemId = `order:${order.sessionId || order.id || ''}:${index}`;
    return {
      sourceType: 'order',
      sourceId: order.sessionId || order.id || '',
      sourceItemId: legacySourceItemId,
      paymentLineId: line?.lineId || legacySourceItemId,
      itemIndex: index,
      productId: item.productId || '', productName: item.productName || item.shortName || '', variantId: item.variantId || '', fit: item.fit || '', size: item.size || '', color: item.color || '',
      sku: item.sku || '', variantSku: item.variantSku || '', campaignId: order.campaignId || '', quantity: remainingQuantity,
      purchasedQuantity: purchased,
      refundedWholeUnitCount: reversedWholeUnits.size
    };
  }).filter((item) => item.quantity > 0);
}

export function allocatedSourceItemQuantities(batches = [], { excludeBatchId = '' } = {}) {
  const allocated = new Map();
  for (const batch of batches) {
    if (!ACTIVE_BATCH_STATUSES.has(batch.status) || batch.id === excludeBatchId) continue;
    for (const item of batch.items || []) {
      if (!item.sourceItemId) continue;
      allocated.set(item.sourceItemId, (allocated.get(item.sourceItemId) || 0) + Math.max(0, Number(item.quantity || 0)));
    }
  }
  return allocated;
}

export function allocatedSourceItemIds(batches = [], options = {}) {
  return new Set([...allocatedSourceItemQuantities(batches, options)].filter(([, quantity]) => quantity > 0).map(([sourceItemId]) => sourceItemId));
}

export function selectEditableChurchBatch(batches = [], campaignId = '') {
  return batches.filter((batch) => batch.batchType === 'campaign_church_pickup' && batch.campaignId === campaignId && ['draft', 'ready'].includes(batch.status)).sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))[0] || null;
}

export function nextChurchBatchNumber(batches = [], campaignId = '') { return batches.filter((batch) => batch.batchType === 'campaign_church_pickup' && batch.campaignId === campaignId).length + 1; }

export function assembleChurchPickupItems({ campaign, orders = [], batches = [], targetBatch = null }) {
  const targetId = targetBatch?.id || '';
  const allocatedElsewhere = allocatedSourceItemQuantities(batches, { excludeBatchId: targetId });
  const items = []; const includedOrders = new Set(); const excluded = []; const adjustments = []; const seen = new Set();
  for (const order of orders) {
    if (order.campaignId !== campaign.id) continue;
    const reasons = [];
    if (order.fulfillment?.mode !== 'church_batch') reasons.push('not_church_pickup');
    if (!hasConfirmedPayment(order)) reasons.push('not_paid');
    const reviewReason = paymentReviewReason(order);
    if (reviewReason) reasons.push(reviewReason);
    if (reasons.length) { excluded.push({ sessionId: order.sessionId || order.id || '', reasons: [...new Set(reasons)] }); continue; }
    for (const item of stableOrderSourceItems(order)) {
      if (!item.sourceId || seen.has(item.sourceItemId)) continue;
      const allocatedQuantity = Math.max(0, Number(allocatedElsewhere.get(item.sourceItemId) || 0));
      const remainingQuantity = Math.max(0, Number(item.quantity || 0) - allocatedQuantity);
      if (!remainingQuantity) {
        excluded.push({ sessionId: item.sourceId, sourceItemId: item.sourceItemId, paymentLineId: item.paymentLineId, reasons: ['already_allocated'], allocatedQuantity });
        continue;
      }
      if (allocatedQuantity || item.refundedWholeUnitCount) adjustments.push({ sessionId: item.sourceId, sourceItemId: item.sourceItemId, paymentLineId: item.paymentLineId, allocatedQuantity, refundedWholeUnitCount: item.refundedWholeUnitCount, remainingQuantity });
      seen.add(item.sourceItemId);
      items.push({ ...item, quantity: remainingQuantity });
      includedOrders.add(item.sourceId);
    }
  }
  return {
    items,
    productionSummary: batchProductionSummary(items),
    ordersIncluded: includedOrders.size,
    unitsIncluded: items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    excluded,
    adjustments
  };
}

export function pickupDestinationSnapshot(campaign) {
  const pickup = campaign?.churchBatch || {};
  return { pickupLocationName: pickup.pickupLocationName || '', address1: pickup.address1 || '', address2: pickup.address2 || '', city: pickup.city || '', state: pickup.state || '', postalCode: pickup.postalCode || '', country: 'US' };
}
