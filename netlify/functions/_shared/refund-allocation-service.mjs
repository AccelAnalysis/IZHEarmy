import { randomUUID } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { cents } from './payment-rules.mjs';

const ORDER_STORE = 'izhe-orders';
const clean = (value, max = 1000) => String(value ?? '').trim().slice(0, max);
const nowIso = () => new Date().toISOString();

function activeHistory(history = []) {
  const reversed = new Set(history.filter((entry) => entry.kind === 'reversal' && entry.reversalOf).map((entry) => entry.reversalOf));
  return history.filter((entry) => entry.kind === 'allocation' && !reversed.has(entry.id));
}

function totalsFromHistory(history = []) {
  const lineAmounts = new Map();
  let shippingAmount = 0;
  let taxAmount = 0;
  let unallocatedAmount = 0;
  for (const entry of activeHistory(history)) {
    shippingAmount += Math.max(0, cents(entry.shippingAmount));
    taxAmount += Math.max(0, cents(entry.taxAmount));
    unallocatedAmount += Math.max(0, cents(entry.unallocatedAmount));
    for (const line of entry.lineAllocations || []) lineAmounts.set(line.lineId, (lineAmounts.get(line.lineId) || 0) + Math.max(0, cents(line.amount)));
  }
  return { lineAmounts, shippingAmount, taxAmount, unallocatedAmount };
}

function unitValues(line) {
  const quantity = Math.max(0, cents(line?.quantityPurchased));
  if (!quantity) return [];
  const total = Math.max(0, cents(line?.netMerchandiseBeforeRefunds));
  const base = Math.floor(total / quantity);
  const remainder = total % quantity;
  return Array.from({ length: quantity }, (_, index) => base + (index < remainder ? 1 : 0));
}

function validateWholeUnits(line, indexes, allocationAmount) {
  if (!indexes?.length) return [];
  const quantity = Math.max(0, cents(line.quantityPurchased));
  const normalized = [...new Set(indexes.map((value) => cents(value, -1)))].sort((a, b) => a - b);
  if (normalized.some((index) => index < 0 || index >= quantity)) throw new Error(`Whole-unit allocation for ${line.lineId} includes an invalid unit index.`);
  const values = unitValues(line);
  const required = normalized.reduce((sum, index) => sum + Math.max(0, cents(values[index])), 0);
  if (allocationAmount < required) throw new Error(`Whole-unit allocation for ${line.lineId} does not refund the complete selected unit value.`);
  return normalized;
}

export function validateRefundAllocation(order, input) {
  if (!order?.payment) throw new Error('This order does not yet have canonical payment facts. Reconcile it with Stripe first.');
  const note = clean(input?.note, 3000);
  if (!note) throw new Error('Refund allocation requires an administrator note.');
  const sourceRefundId = clean(input?.sourceRefundId, 180);
  if (!sourceRefundId) throw new Error('Select the verified Stripe refund being allocated.');
  if (!(order.payment.refundReferences || []).some((refund) => String(refund?.id || refund) === sourceRefundId)) throw new Error('The selected refund ID is not present in the verified Stripe refund facts for this order.');
  const history = Array.isArray(order.refundAllocationHistory) ? order.refundAllocationHistory : [];
  const existing = totalsFromHistory(history);
  const lines = new Map((order.lineSettlements || []).map((line) => [line.lineId, line]));
  const lineAllocations = [];
  for (const requested of input?.lineAllocations || []) {
    const line = lines.get(String(requested?.lineId || ''));
    if (!line) throw new Error('Refund allocation references an unknown immutable order line.');
    const amount = Math.max(0, cents(requested?.amount));
    if (!amount) continue;
    const already = existing.lineAmounts.get(line.lineId) || 0;
    const remaining = Math.max(0, cents(line.netMerchandiseBeforeRefunds) - already);
    if (amount > remaining) throw new Error(`Refund allocation exceeds the remaining merchandise value for ${line.lineId}.`);
    const wholeUnitIndexes = validateWholeUnits(line, requested?.wholeUnitIndexes || [], amount);
    lineAllocations.push({ lineId: line.lineId, amount, wholeUnitIndexes });
  }
  const shippingAmount = Math.max(0, cents(input?.shippingAmount));
  const taxAmount = Math.max(0, cents(input?.taxAmount));
  const unallocatedAmount = Math.max(0, cents(input?.unallocatedAmount));
  if (shippingAmount > Math.max(0, cents(order.payment.amounts?.shippingCollected) - existing.shippingAmount)) throw new Error('Refund allocation exceeds the remaining shipping collected.');
  if (taxAmount > Math.max(0, cents(order.payment.amounts?.taxCollected) - existing.taxAmount)) throw new Error('Refund allocation exceeds the remaining tax collected.');
  const requestedTotal = lineAllocations.reduce((sum, line) => sum + line.amount, 0) + shippingAmount + taxAmount + unallocatedAmount;
  if (!requestedTotal) throw new Error('Allocate at least one cent of the verified refund.');
  const previouslyAssigned = [...existing.lineAmounts.values()].reduce((sum, amount) => sum + amount, 0) + existing.shippingAmount + existing.taxAmount + existing.unallocatedAmount;
  const verifiedTotal = Math.max(0, cents(order.payment.amounts?.totalRefunded));
  if (previouslyAssigned + requestedTotal > verifiedTotal) throw new Error('Refund allocations cannot exceed the verified cumulative Stripe refund total.');
  return {
    sourceRefundId,
    note,
    effectiveAt: input?.effectiveAt ? new Date(input.effectiveAt).toISOString() : nowIso(),
    lineAllocations,
    shippingAmount,
    taxAmount,
    unallocatedAmount
  };
}

export async function appendRefundAllocation(sessionId, input, {
  expectedUpdatedAt = '',
  actorType = 'admin-user',
  actorId = ''
} = {}) {
  const store = getStore(ORDER_STORE);
  const current = await store.getWithMetadata(sessionId, { type: 'json', consistency: 'strong' });
  if (!current?.data) throw Object.assign(new Error('Order was not found.'), { statusCode: 404 });
  if (expectedUpdatedAt && current.data.updatedAt !== expectedUpdatedAt) throw Object.assign(new Error('Order changed while refund allocation was being reviewed. Reload it before applying the allocation.'), { statusCode: 409 });
  const history = Array.isArray(current.data.refundAllocationHistory) ? current.data.refundAllocationHistory : [];
  const at = nowIso();
  let entry;
  if (input?.reversalOf) {
    const reversalOf = clean(input.reversalOf, 180);
    const target = activeHistory(history).find((item) => item.id === reversalOf);
    if (!target) throw new Error('The allocation being reversed is not currently active.');
    const note = clean(input?.note, 3000);
    if (!note) throw new Error('Allocation reversal requires an administrator note.');
    entry = {
      id: `RFA-${randomUUID()}`,
      kind: 'reversal',
      reversalOf,
      sourceRefundId: target.sourceRefundId,
      note,
      effectiveAt: input?.effectiveAt ? new Date(input.effectiveAt).toISOString() : at,
      actorType,
      actorId: clean(actorId, 200),
      createdAt: at
    };
  } else {
    const validated = validateRefundAllocation(current.data, input);
    entry = {
      id: `RFA-${randomUUID()}`,
      kind: 'allocation',
      ...validated,
      actorType,
      actorId: clean(actorId, 200),
      createdAt: at
    };
  }
  const next = {
    ...current.data,
    refundAllocationHistory: [...history, entry].slice(-500),
    updatedAt: at,
    lastAdministrativeActorId: clean(actorId, 200) || current.data.lastAdministrativeActorId || ''
  };
  const saved = await store.setJSON(sessionId, next, { onlyIfMatch: current.etag });
  if (!saved.modified) throw Object.assign(new Error('Order changed while the refund allocation was being appended.'), { statusCode: 409 });
  return { order: next, entry };
}
