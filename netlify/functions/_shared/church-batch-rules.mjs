import { batchProductionSummary } from './operations-rules.mjs';

const INELIGIBLE_ORDER_STATUSES = new Set(['cancelled', 'refunded_or_disputed', 'refund_requires_review']);
const ACTIVE_BATCH_STATUSES = new Set(['draft', 'ready', 'submitted', 'in_production', 'received', 'completed']);

export function isPaidChurchPickupOrder(order, campaignId = '') {
  if (!order) return false;
  if (campaignId && order.campaignId !== campaignId) return false;
  if (order.fulfillment?.mode !== 'church_batch') return false;
  if (order.paymentStatus !== 'paid' && order.status !== 'paid' && !['allocated', 'in_production', 'ready_for_pickup', 'completed'].includes(order.status)) return false;
  if (INELIGIBLE_ORDER_STATUSES.has(order.status)) return false;
  return true;
}

export function stableOrderSourceItems(order) {
  return (order?.items || []).map((item, index) => ({
    sourceType: 'order', sourceId: order.sessionId || order.id || '', sourceItemId: `order:${order.sessionId || order.id || ''}:${index}`, itemIndex: index,
    productId: item.productId || '', productName: item.productName || item.shortName || '', variantId: item.variantId || '', fit: item.fit || '', size: item.size || '', color: item.color || '',
    sku: item.sku || '', variantSku: item.variantSku || '', campaignId: order.campaignId || '', quantity: Math.max(1, Number(item.quantity || 1))
  }));
}

export function allocatedSourceItemIds(batches = [], { excludeBatchId = '' } = {}) {
  const allocated = new Set();
  for (const batch of batches) {
    if (!ACTIVE_BATCH_STATUSES.has(batch.status) || batch.id === excludeBatchId) continue;
    for (const item of batch.items || []) if (item.sourceItemId) allocated.add(item.sourceItemId);
  }
  return allocated;
}

export function selectEditableChurchBatch(batches = [], campaignId = '') {
  return batches.filter((batch) => batch.batchType === 'campaign_church_pickup' && batch.campaignId === campaignId && ['draft', 'ready'].includes(batch.status)).sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))[0] || null;
}

export function nextChurchBatchNumber(batches = [], campaignId = '') { return batches.filter((batch) => batch.batchType === 'campaign_church_pickup' && batch.campaignId === campaignId).length + 1; }

export function assembleChurchPickupItems({ campaign, orders = [], batches = [], targetBatch = null }) {
  const targetId = targetBatch?.id || '';
  const allocatedElsewhere = allocatedSourceItemIds(batches, { excludeBatchId: targetId });
  const items = []; const includedOrders = new Set(); const excluded = []; const seen = new Set();
  for (const order of orders) {
    if (order.campaignId !== campaign.id) continue;
    const reasons = [];
    if (order.fulfillment?.mode !== 'church_batch') reasons.push('not_church_pickup');
    if (order.paymentStatus !== 'paid' && !['paid', 'allocated', 'in_production', 'ready_for_pickup', 'completed'].includes(order.status)) reasons.push('not_paid');
    if (order.status === 'cancelled') reasons.push('cancelled');
    if (order.status === 'refunded_or_disputed') reasons.push('refunded_or_disputed');
    if (order.status === 'refund_requires_review') reasons.push('refund_requires_review');
    if (reasons.length) { excluded.push({ sessionId: order.sessionId || order.id || '', reasons: [...new Set(reasons)] }); continue; }
    for (const item of stableOrderSourceItems(order)) {
      if (!item.sourceId || seen.has(item.sourceItemId)) continue;
      if (allocatedElsewhere.has(item.sourceItemId)) { excluded.push({ sessionId: item.sourceId, sourceItemId: item.sourceItemId, reasons: ['already_allocated'] }); continue; }
      seen.add(item.sourceItemId); items.push(item); includedOrders.add(item.sourceId);
    }
  }
  return { items, productionSummary: batchProductionSummary(items), ordersIncluded: includedOrders.size, unitsIncluded: items.reduce((sum, item) => sum + Number(item.quantity || 0), 0), excluded };
}

export function pickupDestinationSnapshot(campaign) {
  const pickup = campaign?.churchBatch || {};
  return { pickupLocationName: pickup.pickupLocationName || '', address1: pickup.address1 || '', address2: pickup.address2 || '', city: pickup.city || '', state: pickup.state || '', postalCode: pickup.postalCode || '', country: 'US' };
}
