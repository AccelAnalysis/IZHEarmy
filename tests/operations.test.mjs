import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendStatusHistory,
  batchProductionSummary,
  computeOperationalAlerts,
  createBatchId,
  effectiveCodeStatus,
  filterRecords,
  summarizeOperations
} from '../netlify/functions/_shared/operations-rules.mjs';

test('effective code status respects expiration without rewriting redeemed records', () => {
  const now = new Date('2026-07-14T12:00:00Z');
  assert.equal(effectiveCodeStatus({ status: 'active', expiresAt: '2026-07-13T12:00:00Z' }, now), 'expired');
  assert.equal(effectiveCodeStatus({ status: 'active', expiresAt: '2026-07-15T12:00:00Z' }, now), 'active');
  assert.equal(effectiveCodeStatus({ status: 'redeemed', expiresAt: '2026-07-13T12:00:00Z' }, now), 'redeemed');
});

test('filter records searches nested operational values and status', () => {
  const records = [
    { status: 'paid', customerEmail: 'customer@example.com', items: [{ productName: 'YHWH Shirt' }], createdAt: '2026-07-10T12:00:00Z' },
    { status: 'completed', customerEmail: 'other@example.com', items: [{ productName: 'Book' }], createdAt: '2026-06-10T12:00:00Z' }
  ];
  assert.equal(filterRecords(records, { q: 'yhwh', status: 'paid' }).length, 1);
  assert.equal(filterRecords(records, { from: '2026-07-01' }).length, 1);
});

test('production summary aggregates matching variants', () => {
  const summary = batchProductionSummary([
    { productId: 'shirt', productName: 'Shirt', variantId: 'men-m', fit: 'Men', size: 'M', color: 'Black', quantity: 2 },
    { productId: 'shirt', productName: 'Shirt', variantId: 'men-m', fit: 'Men', size: 'M', color: 'Black', quantity: 3 },
    { productId: 'shirt', productName: 'Shirt', variantId: 'men-l', fit: 'Men', size: 'L', color: 'Black', quantity: 1 }
  ]);
  assert.equal(summary.length, 2);
  assert.equal(summary.find((item) => item.size === 'M').quantity, 5);
});

test('operations summary counts open work and sales', () => {
  const summary = summarizeOperations({
    orders: [{ status: 'paid', amountTotal: 3700, items: [{ quantity: 2 }] }, { status: 'completed', amountTotal: 2200, items: [{ quantity: 1 }] }],
    redemptions: [{ status: 'pending_fulfillment' }, { status: 'fulfilled' }],
    codes: [{ status: 'active' }, { status: 'redeemed' }],
    batches: [{ status: 'draft' }, { status: 'completed' }]
  });
  assert.equal(summary.grossSales, 5900);
  assert.equal(summary.soldUnits, 3);
  assert.equal(summary.pendingOrderCount, 1);
  assert.equal(summary.pendingRedemptionCount, 1);
  assert.equal(summary.openBatchCount, 1);
});

test('operational alerts identify overdue and exception records', () => {
  const now = new Date('2026-07-14T12:00:00Z');
  const alerts = computeOperationalAlerts({
    orders: [{ sessionId: 'order-1', status: 'refund_requires_review', createdAt: '2026-07-01T12:00:00Z', shippingDetails: null }],
    redemptions: [{ confirmation: 'gift-1', status: 'pending_fulfillment', createdAt: '2026-07-01T12:00:00Z' }],
    codes: [{ code: 'IZHE-AAAA-BBBB', status: 'active', createdAt: '2026-06-01T12:00:00Z', sourceSessionId: 'order-1' }],
    batches: [{ id: 'batch-1', name: 'Batch 1', status: 'in_production', dueDate: '2026-07-10T12:00:00Z', items: [] }]
  }, now);
  assert.ok(alerts.some((alert) => alert.title === 'Order requires review'));
  assert.ok(alerts.some((alert) => alert.title === 'Gift not allocated'));
  assert.ok(alerts.some((alert) => alert.title === 'Give One code unclaimed'));
  assert.ok(alerts.some((alert) => alert.title === 'Production batch overdue'));
});

test('status history and batch IDs are stable', () => {
  const history = appendStatusHistory({ statusHistory: [] }, 'allocated', 'Added to batch');
  assert.equal(history[0].status, 'allocated');
  assert.match(createBatchId(new Date('2026-07-14T12:00:00Z'), 0), /^BATCH-20260714-[A-Z0-9]{4}$/);
});
