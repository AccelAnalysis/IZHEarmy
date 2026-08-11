export const PAYMENT_POLICY_VERSION = 'izhe-payment-v1';
export const DISCOUNT_ALLOCATION_VERSION = 'gross-largest-remainder-v1';
export const REFUND_ALLOCATION_VERSION = 'verified-components-v1';
export const SUPPORT_CALCULATION_VERSION = 'eligible-settlement-v1';

export const PAYMENT_RECONCILIATION_STATUSES = [
  'reconciled',
  'legacy_reconciled',
  'legacy_unreconciled',
  'stripe_backfill_available',
  'stripe_reference_missing',
  'event_unmatched',
  'allocation_required',
  'index_repair_required',
  'manual_review_required'
];

export function cents(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.trunc(number);
}

export function stableLineId(sessionId, lineIndex) {
  return `order:${String(sessionId || '').trim()}:line:${Math.max(0, Number(lineIndex) || 0)}`;
}

export function deterministicObligationId({ sessionId, lineId, paidUnitIndex, giftUnitIndex }) {
  return `${String(sessionId || '').trim()}:${String(lineId || '').trim()}:paid:${Math.max(0, Number(paidUnitIndex) || 0)}:gift:${Math.max(0, Number(giftUnitIndex) || 0)}`;
}

function allocationEntries(entries) {
  return (Array.isArray(entries) ? entries : []).map((entry, index) => ({
    id: String(entry?.id || index),
    index,
    basis: Math.max(0, cents(entry?.basis))
  }));
}

export function allocateLargestRemainder(totalAmount, entries) {
  const total = Math.max(0, cents(totalAmount));
  const normalized = allocationEntries(entries);
  const output = new Array(normalized.length).fill(0);
  if (!normalized.length || total === 0) return output;
  const basisTotal = normalized.reduce((sum, entry) => sum + entry.basis, 0);
  if (basisTotal <= 0) {
    output[0] = total;
    return output;
  }
  const cappedTotal = Math.min(total, basisTotal);
  const provisional = normalized.map((entry) => {
    const numerator = cappedTotal * entry.basis;
    const floor = Math.floor(numerator / basisTotal);
    return { ...entry, floor, remainder: numerator % basisTotal };
  });
  let assigned = provisional.reduce((sum, entry) => sum + entry.floor, 0);
  for (const entry of provisional) output[entry.index] = entry.floor;
  const ranking = [...provisional].sort((a, b) => b.remainder - a.remainder || a.id.localeCompare(b.id) || a.index - b.index);
  for (let cursor = 0; assigned < cappedTotal; cursor += 1) {
    output[ranking[cursor % ranking.length].index] += 1;
    assigned += 1;
  }
  return output;
}

function stripeLineDiscount(line) {
  return Number.isInteger(line?.amount_discount) ? Math.max(0, line.amount_discount) : null;
}

export function buildLineSettlements({ sessionId, draftItems = [], stripeLineItems = [], orderDiscountTotal = 0 } = {}) {
  const items = Array.isArray(draftItems) ? draftItems : [];
  const stripeItems = Array.isArray(stripeLineItems) ? stripeLineItems : [];
  const grossAmounts = items.map((item, index) => {
    const stripeLine = stripeItems[index] || {};
    const quantity = Math.max(0, cents(item?.quantity));
    const draftGross = Math.max(0, cents(item?.unitAmount) * quantity);
    return Math.max(0, Number.isInteger(stripeLine?.amount_subtotal) ? stripeLine.amount_subtotal : draftGross);
  });
  const authoritativeDiscounts = items.map((_, index) => stripeLineDiscount(stripeItems[index]));
  const requestedDiscount = Math.max(0, cents(orderDiscountTotal));
  const authoritativeSum = authoritativeDiscounts.every((value) => value !== null)
    ? authoritativeDiscounts.reduce((sum, value) => sum + value, 0)
    : -1;
  const discounts = authoritativeSum === requestedDiscount
    ? authoritativeDiscounts
    : allocateLargestRemainder(requestedDiscount, grossAmounts.map((basis, index) => ({ id: stableLineId(sessionId, index), basis })));
  const method = authoritativeSum === requestedDiscount ? 'stripe_line_amount_discount' : DISCOUNT_ALLOCATION_VERSION;
  return items.map((item, index) => {
    const lineId = stableLineId(sessionId, index);
    const quantity = Math.max(0, cents(item?.quantity));
    const grossMerchandiseAmount = grossAmounts[index];
    const allocatedDiscount = Math.min(grossMerchandiseAmount, Math.max(0, cents(discounts[index])));
    const netMerchandiseBeforeRefunds = grossMerchandiseAmount - allocatedDiscount;
    return {
      lineId,
      stripeLineItemId: String(stripeItems[index]?.id || ''),
      productId: String(item?.productId || ''),
      productSnapshot: {
        id: String(item?.productId || ''),
        name: String(item?.productName || ''),
        shortName: String(item?.shortName || ''),
        productType: String(item?.productType || ''),
        collectionId: String(item?.collectionId || ''),
        sku: String(item?.sku || ''),
        image: String(item?.productImage || '')
      },
      variantSnapshot: {
        id: String(item?.variantId || ''),
        fit: String(item?.fit || ''),
        size: String(item?.size || ''),
        color: String(item?.color || ''),
        sku: String(item?.variantSku || '')
      },
      sku: String(item?.variantSku || item?.sku || ''),
      productType: String(item?.productType || ''),
      quantityPurchased: quantity,
      unitAmountSnapshot: Math.max(0, cents(item?.unitAmount)),
      grossMerchandiseAmount,
      allocatedDiscount,
      netMerchandiseBeforeRefunds,
      allocatedMerchandiseRefund: 0,
      netRecognizedMerchandiseRevenue: netMerchandiseBeforeRefunds,
      supportEligible: Boolean(item?.supportEligible),
      supportEligibleQuantity: Boolean(item?.supportEligible) ? quantity : 0,
      giveOneEligible: Boolean(item?.giveOneEligible),
      giveOneUnitsPerPaidUnit: Boolean(item?.giveOneEligible) ? Math.max(1, cents(item?.giveOneUnitsPerPaidUnit, 1)) : 0,
      allocatedWholeUnitReversals: [],
      unresolvedAllocationAmount: 0,
      reconciliationState: 'reconciled',
      allocationMethod: method,
      allocationPolicyVersion: DISCOUNT_ALLOCATION_VERSION
    };
  });
}

export function validateLineSettlementSums(lines = []) {
  const normalized = Array.isArray(lines) ? lines : [];
  return normalized.reduce((totals, line) => {
    totals.merchandiseGross += Math.max(0, cents(line?.grossMerchandiseAmount));
    totals.discountTotal += Math.max(0, cents(line?.allocatedDiscount));
    totals.merchandiseNetBeforeRefunds += Math.max(0, cents(line?.netMerchandiseBeforeRefunds));
    totals.merchandiseRefunded += Math.max(0, cents(line?.allocatedMerchandiseRefund));
    totals.netRecognizedMerchandiseRevenue += Math.max(0, cents(line?.netRecognizedMerchandiseRevenue));
    return totals;
  }, { merchandiseGross: 0, discountTotal: 0, merchandiseNetBeforeRefunds: 0, merchandiseRefunded: 0, netRecognizedMerchandiseRevenue: 0 });
}

export function canonicalPaymentFromCheckout({ session, lines = [], chargeIds = [], paidAt = '', reconciliationStatus = 'reconciled' } = {}) {
  const lineTotals = validateLineSettlementSums(lines);
  const shippingCollected = Math.max(0, cents(session?.total_details?.amount_shipping));
  const taxCollected = Math.max(0, cents(session?.total_details?.amount_tax));
  const totalCharged = Math.max(0, cents(session?.amount_total));
  const paymentIntentId = typeof session?.payment_intent === 'string' ? session.payment_intent : String(session?.payment_intent?.id || '');
  const timestamp = paidAt || new Date().toISOString();
  return {
    checkoutSessionId: String(session?.id || ''),
    paymentIntentId,
    chargeIds: [...new Set((chargeIds || []).map((id) => String(id || '')).filter(Boolean))],
    currency: String(session?.currency || lines?.[0]?.currency || 'usd').toLowerCase(),
    captureStatus: session?.payment_status === 'paid' ? 'paid' : 'pending',
    refundStatus: 'none',
    disputeStatus: 'none',
    reconciliationStatus,
    amounts: {
      merchandiseGross: lineTotals.merchandiseGross,
      discountTotal: lineTotals.discountTotal,
      merchandiseNetBeforeRefunds: lineTotals.merchandiseNetBeforeRefunds,
      shippingCollected,
      taxCollected,
      totalCharged,
      merchandiseRefunded: 0,
      shippingRefunded: 0,
      taxRefunded: 0,
      refundUnallocated: 0,
      totalRefunded: 0,
      openDisputeAmount: 0,
      lostDisputeAmount: 0,
      disputeReinstatedAmount: 0,
      netCollected: totalCharged,
      amountHeld: 0,
      availableAfterHolds: totalCharged,
      processorFee: null,
      verifiedNetDeposit: null
    },
    discountReferences: [],
    refundReferences: [],
    disputeReferences: [],
    paidAt: timestamp,
    lastStripeEventAt: timestamp,
    lastReconciledAt: timestamp,
    policyVersion: PAYMENT_POLICY_VERSION
  };
}

export function applyRefundFacts(payment, { totalRefunded = 0, merchandiseRefunded = 0, shippingRefunded = 0, taxRefunded = 0, refundReferences = [], allocationRequired = false, at = new Date().toISOString() } = {}) {
  const next = structuredClone(payment || {});
  next.amounts ||= {};
  const total = Math.max(0, cents(totalRefunded));
  const merchandise = Math.max(0, cents(merchandiseRefunded));
  const shipping = Math.max(0, cents(shippingRefunded));
  const tax = Math.max(0, cents(taxRefunded));
  const allocated = Math.min(total, merchandise + shipping + tax);
  const unallocated = Math.max(0, total - allocated);
  next.amounts.merchandiseRefunded = merchandise;
  next.amounts.shippingRefunded = shipping;
  next.amounts.taxRefunded = tax;
  next.amounts.refundUnallocated = unallocated;
  next.amounts.totalRefunded = total;
  next.refundStatus = allocationRequired || unallocated > 0 ? 'allocation_required' : total === 0 ? 'none' : total >= Math.max(0, cents(next.amounts.totalCharged)) ? 'full' : 'partial';
  next.reconciliationStatus = next.refundStatus === 'allocation_required' ? 'allocation_required' : next.reconciliationStatus || 'reconciled';
  next.refundReferences = [...new Map([...(next.refundReferences || []), ...refundReferences].map((item) => [String(item?.id || item), item])).values()];
  return recomputePaymentAvailability({ ...next, lastStripeEventAt: at });
}

export function applyDisputeFacts(payment, { status = 'open', amount = 0, disputeId = '', reinstatedAmount = 0, at = new Date().toISOString() } = {}) {
  const next = structuredClone(payment || {});
  next.amounts ||= {};
  const disputedAmount = Math.max(0, cents(amount));
  if (status === 'open') {
    next.disputeStatus = 'open';
    next.amounts.openDisputeAmount = disputedAmount;
  } else if (status === 'won') {
    next.disputeStatus = 'won';
    next.amounts.openDisputeAmount = 0;
    next.amounts.disputeReinstatedAmount = Math.max(cents(next.amounts.disputeReinstatedAmount), Math.max(0, cents(reinstatedAmount || disputedAmount)));
  } else if (status === 'reinstated') {
    next.disputeStatus = 'reinstated';
    next.amounts.openDisputeAmount = 0;
    next.amounts.disputeReinstatedAmount = Math.max(cents(next.amounts.disputeReinstatedAmount), Math.max(0, cents(reinstatedAmount || disputedAmount)));
  } else if (status === 'lost') {
    next.disputeStatus = 'lost';
    next.amounts.openDisputeAmount = 0;
    next.amounts.lostDisputeAmount = Math.max(cents(next.amounts.lostDisputeAmount), disputedAmount);
  } else {
    next.disputeStatus = 'review_required';
    next.reconciliationStatus = 'manual_review_required';
  }
  if (disputeId) {
    const ref = { id: disputeId, status, amount: disputedAmount, at };
    next.disputeReferences = [...new Map([...(next.disputeReferences || []), ref].map((item) => [String(item?.id || ''), item])).values()];
  }
  return recomputePaymentAvailability({ ...next, lastStripeEventAt: at });
}

export function recomputePaymentAvailability(payment) {
  const next = structuredClone(payment || {});
  next.amounts ||= {};
  const charged = Math.max(0, cents(next.amounts.totalCharged));
  const refunded = Math.max(0, cents(next.amounts.totalRefunded));
  const lost = Math.max(0, cents(next.amounts.lostDisputeAmount));
  const overlap = Math.min(refunded, lost);
  const finalLostNotRefunded = Math.max(0, lost - overlap);
  const netCollected = Math.max(0, charged - refunded - finalLostNotRefunded);
  const amountHeld = Math.min(netCollected, Math.max(0, cents(next.amounts.openDisputeAmount)));
  next.amounts.netCollected = netCollected;
  next.amounts.amountHeld = amountHeld;
  next.amounts.availableAfterHolds = Math.max(0, netCollected - amountHeld);
  return next;
}

export function normalizeLegacyPayment(order) {
  if (order?.payment?.checkoutSessionId || order?.payment?.paymentIntentId) return order.payment;
  const totalCharged = Math.max(0, cents(order?.amountTotal));
  const shippingCollected = Math.max(0, cents(order?.amountShipping));
  const taxCollected = Math.max(0, cents(order?.amountTax));
  const merchandiseGross = (order?.items || []).reduce((sum, item) => sum + Math.max(0, cents(item?.unitAmount)) * Math.max(0, cents(item?.quantity)), 0);
  const discountTotal = Math.max(0, merchandiseGross + shippingCollected + taxCollected - totalCharged);
  const proof = String(order?.sessionId || '') && String(order?.paymentIntentId || '') ? 'stripe_backfill_available' : 'legacy_unreconciled';
  return {
    checkoutSessionId: String(order?.sessionId || ''),
    paymentIntentId: String(order?.paymentIntentId || ''),
    chargeIds: [],
    currency: String(order?.currency || 'usd').toLowerCase(),
    captureStatus: order?.paymentStatus === 'paid' || order?.status === 'paid' ? 'paid' : 'pending',
    refundStatus: ['refunded_or_disputed', 'refund_requires_review'].includes(order?.status) ? 'allocation_required' : 'none',
    disputeStatus: 'none',
    reconciliationStatus: proof,
    amounts: {
      merchandiseGross,
      discountTotal,
      merchandiseNetBeforeRefunds: Math.max(0, merchandiseGross - discountTotal),
      shippingCollected,
      taxCollected,
      totalCharged,
      merchandiseRefunded: 0,
      shippingRefunded: 0,
      taxRefunded: 0,
      refundUnallocated: ['refunded_or_disputed', 'refund_requires_review'].includes(order?.status) ? totalCharged : 0,
      totalRefunded: 0,
      openDisputeAmount: 0,
      lostDisputeAmount: 0,
      disputeReinstatedAmount: 0,
      netCollected: totalCharged,
      amountHeld: ['refunded_or_disputed', 'refund_requires_review'].includes(order?.status) ? totalCharged : 0,
      availableAfterHolds: ['refunded_or_disputed', 'refund_requires_review'].includes(order?.status) ? 0 : totalCharged,
      processorFee: null,
      verifiedNetDeposit: null
    },
    discountReferences: [],
    refundReferences: [],
    disputeReferences: [],
    paidAt: String(order?.createdAt || ''),
    lastStripeEventAt: '',
    lastReconciledAt: '',
    policyVersion: PAYMENT_POLICY_VERSION
  };
}

export function allocateRefundToLines(lines = [], allocations = []) {
  const byLine = new Map((allocations || []).filter((entry) => entry?.lineId).map((entry) => [entry.lineId, entry]));
  return (lines || []).map((line) => {
    const allocation = byLine.get(line.lineId);
    const allocatedMerchandiseRefund = allocation ? Math.max(0, Math.min(cents(allocation.amount), cents(line.netMerchandiseBeforeRefunds))) : Math.max(0, cents(line.allocatedMerchandiseRefund));
    const wholeUnits = Array.isArray(allocation?.wholeUnitIndexes) ? [...new Set(allocation.wholeUnitIndexes.map((value) => Math.max(0, cents(value))))] : (line.allocatedWholeUnitReversals || []);
    return {
      ...line,
      allocatedMerchandiseRefund,
      netRecognizedMerchandiseRevenue: Math.max(0, cents(line.netMerchandiseBeforeRefunds) - allocatedMerchandiseRefund),
      allocatedWholeUnitReversals: wholeUnits,
      unresolvedAllocationAmount: 0,
      reconciliationState: 'reconciled',
      refundAllocationPolicyVersion: REFUND_ALLOCATION_VERSION
    };
  });
}

export function supportForOrder(order) {
  const policy = order?.supportPolicy || order?.campaign?.supportPolicy || null;
  if (!policy || !order?.campaignId) return { calculated: 0, held: 0, qualifying: false, eligibleRevenue: 0, eligibleUnits: 0, policyVersion: '' };
  const lines = Array.isArray(order?.lineSettlements) ? order.lineSettlements : [];
  const eligibleLines = lines.filter((line) => line.supportEligible);
  const eligibleRevenue = eligibleLines.reduce((sum, line) => sum + Math.max(0, cents(line.netRecognizedMerchandiseRevenue)), 0);
  const eligibleUnits = eligibleLines.reduce((sum, line) => sum + Math.max(0, cents(line.supportEligibleQuantity) - (line.allocatedWholeUnitReversals || []).length), 0);
  const unresolved = Math.max(0, cents(order?.payment?.amounts?.refundUnallocated));
  const disputed = Math.max(0, cents(order?.payment?.amounts?.openDisputeAmount));
  const supportRate = Math.max(0, Number(policy.supportRate || 0));
  let calculated = 0;
  let held = 0;
  let qualifying = eligibleRevenue > 0 || eligibleUnits > 0;
  if (policy.supportModel === 'per_unit') {
    calculated = Math.round(supportRate * eligibleUnits);
    if (unresolved > 0 || disputed > 0) held = calculated;
  } else if (policy.supportModel === 'fixed') {
    calculated = qualifying ? Math.round(supportRate) : 0;
    if (calculated > 0 && (unresolved > 0 || disputed > 0)) held = calculated;
  } else {
    calculated = Math.round(eligibleRevenue * supportRate / 100);
    const heldBasis = Math.min(eligibleRevenue, unresolved + disputed);
    held = Math.min(calculated, Math.round(heldBasis * supportRate / 100));
  }
  if (order?.payment?.captureStatus !== 'paid') {
    held = calculated;
    qualifying = false;
  }
  return { calculated, held, qualifying, eligibleRevenue, eligibleUnits, policyVersion: String(policy.policyVersion || policy.version || '') };
}
