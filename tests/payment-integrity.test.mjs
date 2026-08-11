import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  allocateLargestRemainder,
  applyDisputeFacts,
  applyRefundFacts,
  allocateRefundToLines,
  buildLineSettlements,
  canonicalPaymentFromCheckout,
  deterministicObligationId,
  stableLineId,
  supportForOrder,
  validateLineSettlementSums
} from '../netlify/functions/_shared/payment-rules.mjs';
import { expectedGiveOneObligations } from '../netlify/functions/_shared/give-one-service.mjs';
import { privacyMinimizedStripeReceipt } from '../netlify/functions/_shared/stripe-event-service.mjs';
import { createSupportPolicy, reconcileCampaignSupportPolicies, supportPolicySnapshot } from '../netlify/functions/_shared/support-policy.mjs';
import { validateRefundAllocation } from '../netlify/functions/_shared/refund-allocation-service.mjs';
import { validateLedgerEntry } from '../netlify/functions/_shared/accountability-rules.mjs';

function session(overrides = {}) {
  return {
    id: 'cs_test', payment_status: 'paid', payment_intent: 'pi_test', currency: 'usd', amount_total: 6201,
    total_details: { amount_discount: 199, amount_shipping: 500, amount_tax: 400 }, ...overrides
  };
}

function item(overrides = {}) {
  return {
    productId: 'shirt-1', productName: 'Your Healer', shortName: 'Your Healer', productType: 'apparel', collectionId: 'collection_1',
    sku: 'SHIRT', unitAmount: 2500, currency: 'usd', supportEligible: true, giveOneEligible: true, giveOneUnitsPerPaidUnit: 1,
    variantId: 'unisex-m', fit: 'Unisex', size: 'M', color: 'Black', variantSku: 'SHIRT-M', eligibleGiftVariants: [], quantity: 2,
    ...overrides
  };
}

function canonicalOrder({ lines, payment, policy } = {}) {
  return {
    sessionId: 'cs_test', campaignId: 'CAM-1',
    lineSettlements: lines || [], payment,
    supportPolicy: policy || {
      campaignId: 'CAM-1', policyId: 'CAM-1:support', policyVersion: 'CAM-1:support:v1', version: 1,
      supportModel: 'percentage', supportRate: 10, currency: 'usd', calculationPolicyVersion: 'eligible-settlement-v1'
    }
  };
}

test('largest-remainder discount allocation is integer-cent exact and deterministic', () => {
  const entries = [{ id: 'a', basis: 101 }, { id: 'b', basis: 100 }, { id: 'c', basis: 99 }];
  const first = allocateLargestRemainder(1, entries);
  const second = allocateLargestRemainder(1, entries);
  assert.deepEqual(first, second);
  assert.equal(first.reduce((sum, value) => sum + value, 0), 1);
  assert.deepEqual(first, [1, 0, 0]);
  const uneven = allocateLargestRemainder(17, [{ id: 'a', basis: 1000 }, { id: 'b', basis: 333 }, { id: 'c', basis: 111 }]);
  assert.equal(uneven.reduce((sum, value) => sum + value, 0), 17);
  assert.ok(uneven.every(Number.isInteger));
});

test('discount allocation handles zero-value lines and discount equal to merchandise gross', () => {
  assert.deepEqual(allocateLargestRemainder(1, [{ id: 'zero', basis: 0 }, { id: 'paid', basis: 100 }]), [0, 1]);
  const full = allocateLargestRemainder(300, [{ id: 'one', basis: 100 }, { id: 'two', basis: 200 }]);
  assert.deepEqual(full, [100, 200]);
});

test('line settlements use Stripe line discounts when authoritative and preserve historical snapshots', () => {
  const draftItems = [item({ quantity: 2 }), item({ productId: 'book', productName: 'Book', productType: 'book', sku: 'BOOK', unitAmount: 1200, supportEligible: false, giveOneEligible: false, giveOneUnitsPerPaidUnit: 0, variantId: '', variantSku: '', quantity: 1 })];
  const stripeLines = [
    { id: 'li_1', amount_subtotal: 5000, amount_discount: 150 },
    { id: 'li_2', amount_subtotal: 1200, amount_discount: 49 }
  ];
  const lines = buildLineSettlements({ sessionId: 'cs_test', draftItems, stripeLineItems: stripeLines, orderDiscountTotal: 199 });
  assert.equal(lines[0].allocatedDiscount, 150);
  assert.equal(lines[1].allocatedDiscount, 49);
  assert.equal(lines.reduce((sum, line) => sum + line.allocatedDiscount, 0), 199);
  assert.equal(lines[0].allocationMethod, 'stripe_line_amount_discount');
  assert.equal(lines[0].productSnapshot.name, 'Your Healer');
  draftItems[0].productName = 'Catalog changed later';
  assert.equal(lines[0].productSnapshot.name, 'Your Healer');
  assert.equal(lines[1].supportEligible, false);
  assert.equal(lines[1].giveOneEligible, false);
});

test('order-level discount allocation sums exactly across several lines and quantities', () => {
  const draftItems = [item({ quantity: 3, unitAmount: 1999 }), item({ productId: 'shirt-2', quantity: 2, unitAmount: 2501 })];
  const stripeLines = [{ id: 'li_1', amount_subtotal: 5997 }, { id: 'li_2', amount_subtotal: 5002 }];
  const lines = buildLineSettlements({ sessionId: 'cs_test', draftItems, stripeLineItems: stripeLines, orderDiscountTotal: 333 });
  assert.equal(lines.reduce((sum, line) => sum + line.allocatedDiscount, 0), 333);
  assert.ok(lines.every((line) => Number.isInteger(line.allocatedDiscount)));
  assert.ok(lines.every((line) => line.allocationMethod === 'gross-largest-remainder-v1'));
});

test('canonical payment separates merchandise, shipping, tax, discount, charge, and currency', () => {
  const lines = buildLineSettlements({ sessionId: 'cs_test', draftItems: [item()], stripeLineItems: [{ amount_subtotal: 5000 }], orderDiscountTotal: 199 });
  const payment = canonicalPaymentFromCheckout({ session: session(), lines, chargeIds: ['ch_1'] });
  assert.equal(payment.amounts.merchandiseGross, 5000);
  assert.equal(payment.amounts.discountTotal, 199);
  assert.equal(payment.amounts.merchandiseNetBeforeRefunds, 4801);
  assert.equal(payment.amounts.shippingCollected, 500);
  assert.equal(payment.amounts.taxCollected, 400);
  assert.equal(payment.amounts.totalCharged, 6201);
  assert.equal(payment.currency, 'usd');
  assert.equal(payment.amounts.netCollected, 6201);
  assert.ok(Object.values(payment.amounts).filter((value) => value !== null).every(Number.isInteger));
});

test('line settlement sums reconcile and do not depend on current catalog values', () => {
  const lines = buildLineSettlements({ sessionId: 'cs_test', draftItems: [item({ unitAmount: 2500 })], stripeLineItems: [{ amount_subtotal: 5000 }], orderDiscountTotal: 199 });
  const totals = validateLineSettlementSums(lines);
  assert.deepEqual(totals, { merchandiseGross: 5000, discountTotal: 199, merchandiseNetBeforeRefunds: 4801, merchandiseRefunded: 0, netRecognizedMerchandiseRevenue: 4801 });
});

test('refund facts record actual cumulative amount and ambiguous remainder without whole-order inflation', () => {
  const base = canonicalPaymentFromCheckout({ session: session(), lines: buildLineSettlements({ sessionId: 'cs_test', draftItems: [item()], stripeLineItems: [{ amount_subtotal: 5000 }], orderDiscountTotal: 199 }) });
  const partial = applyRefundFacts(base, { totalRefunded: 500, merchandiseRefunded: 300, shippingRefunded: 100, taxRefunded: 0, allocationRequired: true, refundReferences: [{ id: 're_1' }] });
  assert.equal(partial.amounts.totalRefunded, 500);
  assert.equal(partial.amounts.refundUnallocated, 100);
  assert.equal(partial.refundStatus, 'allocation_required');
  assert.equal(partial.reconciliationStatus, 'allocation_required');
  assert.equal(partial.amounts.netCollected, 5701);
});

test('full refund records all remaining components and zero net collection', () => {
  const base = canonicalPaymentFromCheckout({ session: session(), lines: buildLineSettlements({ sessionId: 'cs_test', draftItems: [item()], stripeLineItems: [{ amount_subtotal: 5000 }], orderDiscountTotal: 199 }) });
  const full = applyRefundFacts(base, { totalRefunded: 6201, merchandiseRefunded: 4801, shippingRefunded: 500, taxRefunded: 400 });
  assert.equal(full.refundStatus, 'full');
  assert.equal(full.amounts.refundUnallocated, 500);
  // The remaining 500 cents demonstrates that a Stripe total cannot be silently forced into merchandise/shipping/tax when the components do not prove it.
  assert.equal(full.reconciliationStatus, 'allocation_required');
  assert.equal(full.amounts.netCollected, 0);
});

test('allocated merchandise refund reduces line-recognized revenue and can prove whole units', () => {
  const lines = buildLineSettlements({ sessionId: 'cs_test', draftItems: [item()], stripeLineItems: [{ amount_subtotal: 5000, amount_discount: 0 }], orderDiscountTotal: 0 });
  const allocated = allocateRefundToLines(lines, [{ lineId: lines[0].lineId, amount: 2500, wholeUnitIndexes: [1] }]);
  assert.equal(allocated[0].allocatedMerchandiseRefund, 2500);
  assert.equal(allocated[0].netRecognizedMerchandiseRevenue, 2500);
  assert.deepEqual(allocated[0].allocatedWholeUnitReversals, [1]);
});

test('dispute lifecycle distinguishes open hold, won release, and final loss', () => {
  const base = canonicalPaymentFromCheckout({ session: session(), lines: buildLineSettlements({ sessionId: 'cs_test', draftItems: [item()], stripeLineItems: [{ amount_subtotal: 5000 }], orderDiscountTotal: 199 }) });
  const open = applyDisputeFacts(base, { status: 'open', amount: 2000, disputeId: 'dp_1' });
  assert.equal(open.disputeStatus, 'open');
  assert.equal(open.amounts.amountHeld, 2000);
  assert.equal(open.amounts.availableAfterHolds, 4201);
  const won = applyDisputeFacts(open, { status: 'won', amount: 2000, disputeId: 'dp_1' });
  assert.equal(won.disputeStatus, 'won');
  assert.equal(won.amounts.amountHeld, 0);
  assert.equal(won.amounts.disputeReinstatedAmount, 2000);
  const lost = applyDisputeFacts(base, { status: 'lost', amount: 2000, disputeId: 'dp_2' });
  assert.equal(lost.disputeStatus, 'lost');
  assert.equal(lost.amounts.lostDisputeAmount, 2000);
  assert.equal(lost.amounts.netCollected, 4201);
});

test('deterministic line and Give One obligation identities remain stable on retry', () => {
  const lineId = stableLineId('cs_test', 0);
  assert.equal(lineId, 'order:cs_test:line:0');
  const first = deterministicObligationId({ sessionId: 'cs_test', lineId, paidUnitIndex: 1, giftUnitIndex: 0 });
  const second = deterministicObligationId({ sessionId: 'cs_test', lineId, paidUnitIndex: 1, giftUnitIndex: 0 });
  assert.equal(first, second);
  assert.match(first, /^cs_test:order:cs_test:line:0:paid:1:gift:0$/);
});

test('Give One expectation is exactly one per eligible unit and supports multiple gifts per paid unit', () => {
  const items = [item({ quantity: 2, giveOneUnitsPerPaidUnit: 2 }), item({ productId: 'book', productType: 'book', giveOneEligible: false, supportEligible: false, quantity: 3 })];
  const lines = buildLineSettlements({ sessionId: 'cs_test', draftItems: items, stripeLineItems: [{ amount_subtotal: 5000 }, { amount_subtotal: 3600 }], orderDiscountTotal: 0 });
  const expected = expectedGiveOneObligations({ sessionId: 'cs_test', items, lineSettlements: lines });
  assert.equal(expected.length, 4);
  assert.equal(new Set(expected.map((entry) => entry.obligationId)).size, 4);
  assert.ok(expected.every((entry) => entry.productId === 'shirt-1'));
});

test('percentage support uses net support-eligible merchandise after allocated discount and refund only', () => {
  let lines = buildLineSettlements({ sessionId: 'cs_test', draftItems: [item(), item({ productId: 'book', productType: 'book', supportEligible: false, giveOneEligible: false, unitAmount: 1200, quantity: 1 })], stripeLineItems: [{ amount_subtotal: 5000 }, { amount_subtotal: 1200 }], orderDiscountTotal: 200 });
  lines = allocateRefundToLines(lines, [{ lineId: lines[0].lineId, amount: 1000, wholeUnitIndexes: [] }]);
  const payment = canonicalPaymentFromCheckout({ session: session({ amount_total: 6700, total_details: { amount_discount: 200, amount_shipping: 500, amount_tax: 400 } }), lines });
  const support = supportForOrder(canonicalOrder({ lines, payment }));
  assert.equal(support.eligibleRevenue, lines[0].netRecognizedMerchandiseRevenue);
  assert.equal(support.calculated, Math.round(lines[0].netRecognizedMerchandiseRevenue * 0.10));
});

test('per-unit support counts only support-eligible settled whole units and excludes books', () => {
  const lines = [
    { lineId: 'shirt', supportEligible: true, supportEligibleQuantity: 3, quantityPurchased: 3, netRecognizedMerchandiseRevenue: 5000, allocatedWholeUnitReversals: [1] },
    { lineId: 'book', supportEligible: false, supportEligibleQuantity: 0, quantityPurchased: 2, netRecognizedMerchandiseRevenue: 2400, allocatedWholeUnitReversals: [] }
  ];
  const payment = { captureStatus: 'paid', amounts: { refundUnallocated: 0, openDisputeAmount: 0 } };
  const policy = { campaignId: 'CAM-1', policyVersion: 'CAM-1:support:v2', supportModel: 'per_unit', supportRate: 250 };
  const support = supportForOrder(canonicalOrder({ lines, payment, policy }));
  assert.equal(support.eligibleUnits, 2);
  assert.equal(support.calculated, 500);
});

test('ambiguous refund and open dispute hold support instead of guessing final units or loss', () => {
  const lines = [{ lineId: 'shirt', supportEligible: true, supportEligibleQuantity: 2, quantityPurchased: 2, netRecognizedMerchandiseRevenue: 5000, allocatedWholeUnitReversals: [] }];
  const ambiguous = supportForOrder(canonicalOrder({ lines, payment: { captureStatus: 'paid', amounts: { refundUnallocated: 500, openDisputeAmount: 0 } } }));
  assert.equal(ambiguous.calculated, 500);
  assert.equal(ambiguous.held, 50);
  const disputed = supportForOrder(canonicalOrder({ lines, payment: { captureStatus: 'paid', amounts: { refundUnallocated: 0, openDisputeAmount: 2000 } } }));
  assert.equal(disputed.calculated, 500);
  assert.equal(disputed.held, 200);
});

test('fixed support is zero without qualifying activity and accrues only for qualifying eligible settlement', () => {
  const policy = { campaignId: 'CAM-1', policyVersion: 'CAM-1:support:v1', supportModel: 'fixed', supportRate: 5000 };
  const payment = { captureStatus: 'paid', amounts: { refundUnallocated: 0, openDisputeAmount: 0 } };
  assert.equal(supportForOrder(canonicalOrder({ lines: [], payment, policy })).calculated, 0);
  const eligible = [{ lineId: 'shirt', supportEligible: true, supportEligibleQuantity: 1, quantityPurchased: 1, netRecognizedMerchandiseRevenue: 2500, allocatedWholeUnitReversals: [] }];
  assert.equal(supportForOrder(canonicalOrder({ lines: eligible, payment, policy })).calculated, 5000);
});

test('campaign support policy changes become prospective versions after qualifying commerce', () => {
  const campaign = { id: 'CAM-1', supportModel: 'percentage', supportRate: 10, supportLabel: 'Support' };
  const initial = reconcileCampaignSupportPolicies(campaign, null, { hasQualifyingCommerce: false, now: '2026-08-01T00:00:00.000Z' });
  assert.equal(initial.supportPolicies.length, 1);
  const changed = reconcileCampaignSupportPolicies({ ...initial, supportRate: 15 }, initial, { hasQualifyingCommerce: true, now: '2026-08-11T00:00:00.000Z' });
  assert.equal(changed.supportPolicies.length, 2);
  assert.equal(changed.supportPolicies[0].supportRate, 10);
  assert.equal(changed.supportPolicies[1].supportRate, 15);
  assert.notEqual(changed.supportPolicies[0].policyVersion, changed.supportPolicies[1].policyVersion);
  assert.ok(changed.supportPolicies[0].lockedAt);
  assert.equal(supportPolicySnapshot(changed).supportRate, 15);
  assert.equal(createSupportPolicy(campaign, { version: 3 }).policyVersion, 'CAM-1:support:v3');
});

test('administrator refund allocation cannot exceed verified totals or remaining components', () => {
  const order = {
    payment: {
      refundReferences: [{ id: 're_1' }], amounts: { totalRefunded: 1000, shippingCollected: 500, taxCollected: 400 }
    },
    lineSettlements: [{ lineId: 'line-1', quantityPurchased: 2, netMerchandiseBeforeRefunds: 5000 }],
    refundAllocationHistory: []
  };
  const valid = validateRefundAllocation(order, { sourceRefundId: 're_1', note: 'Allocate verified refund.', lineAllocations: [{ lineId: 'line-1', amount: 500 }], shippingAmount: 100, taxAmount: 100, unallocatedAmount: 300 });
  assert.equal(valid.lineAllocations[0].amount, 500);
  assert.throws(() => validateRefundAllocation(order, { sourceRefundId: 're_1', note: 'Too much.', lineAllocations: [{ lineId: 'line-1', amount: 1100 }] }), /cannot exceed|exceeds|verified cumulative Stripe refund/i);
  assert.throws(() => validateRefundAllocation(order, { sourceRefundId: 'missing', note: 'Bad refund.', lineAllocations: [{ lineId: 'line-1', amount: 100 }] }), /not present in the verified Stripe refund facts/);
  assert.throws(() => validateRefundAllocation(order, { sourceRefundId: 're_1', note: '', lineAllocations: [{ lineId: 'line-1', amount: 100 }] }), /requires an administrator note/);
});

test('whole-unit refund allocation must fund the complete selected unit', () => {
  const order = {
    payment: { refundReferences: [{ id: 're_1' }], amounts: { totalRefunded: 2500, shippingCollected: 0, taxCollected: 0 } },
    lineSettlements: [{ lineId: 'line-1', quantityPurchased: 2, netMerchandiseBeforeRefunds: 5000 }], refundAllocationHistory: []
  };
  assert.throws(() => validateRefundAllocation(order, { sourceRefundId: 're_1', note: 'Not enough for a whole unit.', lineAllocations: [{ lineId: 'line-1', amount: 2499, wholeUnitIndexes: [0] }] }), /complete selected unit value/);
  const valid = validateRefundAllocation(order, { sourceRefundId: 're_1', note: 'Whole unit.', lineAllocations: [{ lineId: 'line-1', amount: 2500, wholeUnitIndexes: [0] }] });
  assert.deepEqual(valid.lineAllocations[0].wholeUnitIndexes, [0]);
});

test('mission ledger rejects manual Stripe refund duplication and preserves explicit actor/currency/idempotency facts', () => {
  const campaigns = [{ id: 'CAM-1' }];
  assert.throws(() => validateLedgerEntry({ campaignId: 'CAM-1', type: 'refund_adjustment', amount: 500 }, campaigns), /valid ledger entry type|Stripe refunds/);
  const entry = validateLedgerEntry({ campaignId: 'CAM-1', type: 'support_payment', amount: 100, idempotencyKey: 'pay-1', currency: 'usd' }, campaigns);
  assert.equal(entry.idempotencyKey, 'pay-1');
  assert.equal(entry.actorType, 'admin-token');
  assert.equal(entry.currency, 'usd');
});

test('Stripe event receipt is privacy-minimized and uses a non-PII payload digest', () => {
  const event = {
    id: 'evt_1', type: 'charge.refunded', created: 1786420800, livemode: false,
    data: { object: { object: 'charge', id: 'ch_1', payment_intent: 'pi_1', billing_details: { email: 'private@example.com', address: { line1: '100 Private St' } }, payment_method_details: { card: { last4: '4242' } } } }
  };
  const raw = JSON.stringify(event);
  const receipt = privacyMinimizedStripeReceipt(event, raw, { buildVersion: 'abc123' });
  const serialized = JSON.stringify(receipt);
  assert.equal(receipt.stripeEventId, 'evt_1');
  assert.equal(receipt.paymentIntentId, 'pi_1');
  assert.equal(receipt.chargeId, 'ch_1');
  assert.equal(receipt.livemode, false);
  assert.equal(receipt.payloadDigest.length, 64);
  assert.doesNotMatch(serialized, /private@example\.com|100 Private St|4242/);
  assert.doesNotMatch(serialized, /billing_details|payment_method_details/);
});

test('webhook source verifies signature before creating trusted event receipt and retries failed effects', () => {
  const source = fs.readFileSync(new URL('../netlify/functions/stripe-webhook.mjs', import.meta.url), 'utf8');
  assert.ok(source.indexOf('constructEventAsync') < source.indexOf('beginStripeEventReceipt'));
  assert.match(source, /begun\.alreadyProcessed/);
  assert.match(source, /failStripeEvent\(event\.id/);
  assert.match(source, /return new Response\(reconciliationRequired \? 'Webhook reconciliation required' : 'Webhook processing failed', \{ status: 500 \}\)/);
  assert.match(source, /ignored_supported_noop/);
  assert.match(source, /refund\.created/);
  assert.match(source, /refund\.updated/);
  assert.match(source, /charge\.dispute\.funds_reinstated/);
});

test('resumable workflow uses expiring owner lease and persists stages instead of a permanent one-shot lock', () => {
  const workflow = fs.readFileSync(new URL('../netlify/functions/_shared/order-workflow-service.mjs', import.meta.url), 'utf8');
  const fulfill = fs.readFileSync(new URL('../netlify/functions/_shared/fulfill.mjs', import.meta.url), 'utf8');
  assert.match(workflow, /leaseExpiresAt/);
  assert.match(workflow, /ownerAttemptId/);
  assert.match(workflow, /recoveryCount/);
  assert.match(workflow, /failed_retryable/);
  for (const stage of ['payment_verified','checkout_draft_resolved','order_initialized','line_settlement_saved','give_one_obligations_ensured','order_finalized','payment_indexes_ensured','accountability_projection_ensured']) assert.match(fulfill, new RegExp(stage));
  assert.doesNotMatch(fulfill, /lock-\$\{session\.id\}/);
  assert.match(fulfill, /ensurePaymentIndexes\(finalized\)/);
  assert.match(fulfill, /ensureGiveOneObligations/);
  assert.match(fulfill, /resolveReconciliationTask\(`paid_order_workflow_failed:/);
});

test('payment reversal lookup falls back to order scan so a missing index cannot silently lose a refund or dispute', () => {
  const source = fs.readFileSync(new URL('../netlify/functions/_shared/payment-service.mjs', import.meta.url), 'utf8');
  assert.match(source, /scanOrdersForReference/);
  assert.match(source, /order_scan_payment_intent/);
  assert.match(source, /order_scan_charge/);
  assert.match(source, /ensurePaymentIndexes\(order\)/);
  assert.match(source, /stripe\.refunds\.list\(\{ payment_intent/);
  assert.match(source, /stripe\.disputes\.list\(\{ payment_intent/);
});

test('unmatched reversals become reconciliation exceptions instead of successful no-ops', () => {
  const source = fs.readFileSync(new URL('../netlify/functions/_shared/payment-event-service.mjs', import.meta.url), 'utf8');
  assert.match(source, /type: 'unmatched_stripe_event'/);
  assert.match(source, /reconciliationRequired: true/);
  assert.match(source, /refund_allocation_required/);
  assert.match(source, /open_payment_dispute/);
  assert.match(source, /dispute_resolved_funds_restored/);
});

test('post-production refund and dispute paths preserve batch history and create critical reconciliation tasks', () => {
  const source = fs.readFileSync(new URL('../netlify/functions/_shared/payment-event-service.mjs', import.meta.url), 'utf8');
  assert.match(source, /COMMITTED_BATCH_STATUSES/);
  assert.match(source, /post_production_reversal/);
  assert.match(source, /post_production_payment_review/);
  assert.match(source, /Production history is preserved/);
  assert.match(source, /severity: 'critical'/);
});

test('reconciliation endpoint is local-repair only and exposes dry-run plus ETag apply protection', () => {
  const source = fs.readFileSync(new URL('../netlify/functions/admin-reconcile-payment.mjs', import.meta.url), 'utf8');
  assert.match(source, /dryRun: payload\.apply !== true/);
  assert.match(source, /Apply mode requires the order revision timestamp/);
  assert.match(source, /expectedUpdatedAt/);
  assert.match(source, /applyStripeReconciliation/);
  assert.doesNotMatch(source, /refunds\.create|paymentIntents\.capture|paymentIntents\.cancel|products\.update|prices\.update/);
});

test('legacy migration report is inspection-only and never deletes locks or rewrites orders', () => {
  const source = fs.readFileSync(new URL('../netlify/functions/admin-payment-migration-report.mjs', import.meta.url), 'utf8');
  assert.match(source, /dryRun: true/);
  assert.match(source, /stripe_backfill_available/);
  assert.match(source, /stripe_reference_missing/);
  assert.match(source, /legacyLockCount/);
  assert.match(source, /mutationPerformed: false/);
  assert.doesNotMatch(source, /\.delete\(/);
});

test('public accountability withholds provisional exact figures and excludes private Stripe or customer identifiers', () => {
  const source = fs.readFileSync(new URL('../netlify/functions/public-campaign.mjs', import.meta.url), 'utf8');
  assert.match(source, /figuresUnderReconciliation/);
  assert.match(source, /Figures are under reconciliation/);
  assert.match(source, /supportPaid: statement\.supportPaid/);
  assert.match(source, /underReconciliation \? null/);
  assert.doesNotMatch(source, /customerEmail|customerName|customerPhone|paymentIntentId|chargeIds|refundReferences|disputeReferences|pickupCode|internalNotes/);
});

test('administrator payment detail is privacy-minimized and exports retain source cents', () => {
  const finance = fs.readFileSync(new URL('../netlify/functions/admin-finance-data.mjs', import.meta.url), 'utf8');
  const exportSource = fs.readFileSync(new URL('../netlify/functions/admin-finance-export.mjs', import.meta.url), 'utf8');
  assert.match(finance, /paymentIntegrityOrders/);
  assert.doesNotMatch(finance, /customerEmail:|customerName:|customerPhone:|shippingDetails:/);
  assert.match(exportSource, /merchandise_gross_cents/);
  assert.match(exportSource, /total_refunded_cents/);
  assert.match(exportSource, /support_overpaid_cents/);
  assert.match(exportSource, /give_one_suspended/);
});

test('admin ledger endpoint requires stable idempotency and validates balances inside the serialized scope', () => {
  const endpoint = fs.readFileSync(new URL('../netlify/functions/admin-save-ledger-entry.mjs', import.meta.url), 'utf8');
  const service = fs.readFileSync(new URL('../netlify/functions/_shared/accountability-service.mjs', import.meta.url), 'utf8');
  assert.match(endpoint, /A stable idempotency key is required/);
  assert.match(endpoint, /validateWithinLease/);
  assert.match(service, /izhe-mission-ledger-scopes/);
  assert.match(service, /duplicate_idempotency_key/);
  assert.match(service, /leaseExpiresAt/);
  assert.match(service, /revision:/);
  assert.match(service, /onlyIfMatch/);
});

test('support eligibility is explicit, book defaults false, and checkout snapshots the support policy', () => {
  const defaults = fs.readFileSync(new URL('../netlify/functions/_shared/catalog-defaults.mjs', import.meta.url), 'utf8');
  const rules = fs.readFileSync(new URL('../netlify/functions/_shared/catalog-rules.mjs', import.meta.url), 'utf8');
  const checkout = fs.readFileSync(new URL('../netlify/functions/create-checkout-session.mjs', import.meta.url), 'utf8');
  assert.match(defaults, /supportEligible: true/);
  assert.match(defaults, /id: 'c1-book'[\s\S]*supportEligible: false/);
  assert.match(rules, /Select whether this product is eligible for mission support/);
  assert.match(checkout, /supportEligible: Boolean\(product\.supportEligible\)/);
  assert.match(checkout, /supportPolicyVersion/);
  assert.match(checkout, /supportPolicySnapshot\(campaign\)/);
});

test('Give One recipient path stays individual-address based and payment-review suspension is reversible', () => {
  const redeem = fs.readFileSync(new URL('../netlify/functions/redeem-give-code.mjs', import.meta.url), 'utf8');
  const service = fs.readFileSync(new URL('../netlify/functions/_shared/give-one-service.mjs', import.meta.url), 'utf8');
  assert.match(redeem, /address1/);
  assert.match(redeem, /suspended_payment_review/);
  assert.match(service, /action === 'suspend'/);
  assert.match(service, /action === 'reactivate'/);
  assert.match(service, /payment_reversal_after_gift_commitment/);
  assert.doesNotMatch(redeem, /church_batch/);
});
