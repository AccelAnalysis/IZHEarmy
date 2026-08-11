import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assembleChurchPickupItems, stableOrderSourceItems } from '../netlify/functions/_shared/church-batch-rules.mjs';
import { churchBatchReadiness } from '../netlify/functions/_shared/fulfillment-rules.mjs';
import { computeOperationalAlerts, resolveOrderBatchLifecycle } from '../netlify/functions/_shared/operations-rules.mjs';

const pickup = {
  pickupLocationName: 'New Hope Church', address1: '100 Main St', address2: '', city: 'Smithfield', state: 'VA', postalCode: '23430', country: 'US',
  publicInstructions: 'Bring your pickup code.', internalInstructions: '', estimatedReadyAt: '2026-09-05T14:00:00.000Z',
  pickupStartAt: '2026-09-06T14:00:00.000Z', pickupEndAt: '2026-09-07T22:00:00.000Z', contactName: '', contactEmail: '', contactPhone: ''
};
const campaign = { id: 'CAM-1', title: 'Campaign', organization: 'New Hope Church', fulfillmentMethod: 'church_batch', startAt: '2026-08-01T00:00:00.000Z', endAt: '2026-08-31T23:59:59.000Z', churchBatch: pickup };

function pickupOrder(quantity = 3) {
  return { sessionId: 'cs_split', campaignId: 'CAM-1', paymentStatus: 'paid', status: 'paid', fulfillment: { mode: 'church_batch' }, items: [{ productId: 'shirt', productName: 'Shirt', variantId: 'v1', variantSku: 'SKU-M', fit: 'Unisex', size: 'M', color: 'Black', quantity }] };
}

test('partial allocation batches only the remaining order-line quantity', () => {
  const order = pickupOrder(3);
  const [source] = stableOrderSourceItems(order);
  const submitted = { id: 'B1', batchType: 'campaign_church_pickup', campaignId: 'CAM-1', status: 'submitted', items: [{ ...source, quantity: 1 }] };
  const selection = assembleChurchPickupItems({ campaign, orders: [order], batches: [submitted] });
  assert.equal(selection.items.length, 1);
  assert.equal(selection.items[0].quantity, 2);
  assert.equal(selection.unitsIncluded, 2);
  assert.deepEqual(selection.adjustments[0], { sessionId: 'cs_split', sourceItemId: 'order:cs_split:0', allocatedQuantity: 1, remainingQuantity: 2 });
});

test('full allocation across multiple batches prevents duplicate production', () => {
  const order = pickupOrder(3);
  const [source] = stableOrderSourceItems(order);
  const batches = [
    { id: 'B1', batchType: 'campaign_church_pickup', campaignId: 'CAM-1', status: 'submitted', items: [{ ...source, quantity: 1 }] },
    { id: 'B2', batchType: 'campaign_church_pickup', campaignId: 'CAM-1', status: 'in_production', items: [{ ...source, quantity: 2 }] }
  ];
  const selection = assembleChurchPickupItems({ campaign, orders: [order], batches });
  assert.equal(selection.items.length, 0);
  assert.ok(selection.excluded.some((item) => item.sourceItemId === 'order:cs_split:0' && item.reasons.includes('already_allocated') && item.allocatedQuantity === 3));
});

test('explicit unpaid payment status is never accepted from an advanced operational state', () => {
  const order = { ...pickupOrder(1), paymentStatus: 'unpaid', status: 'allocated' };
  const selection = assembleChurchPickupItems({ campaign, orders: [order], batches: [] });
  assert.equal(selection.items.length, 0);
  assert.ok(selection.excluded.some((item) => item.reasons.includes('not_paid')));
});

test('church pickup reaches ready only after every required quantity is received', () => {
  const items = [{ quantity: 3 }];
  assert.deepEqual(
    resolveOrderBatchLifecycle({ mode: 'church_batch', orderStatus: 'allocated', items, assignments: [{ itemIndex: 0, quantity: 1, batchStatus: 'received' }] }),
    { orderStatus: 'in_production', fulfillmentStatus: 'in_production' }
  );
  assert.deepEqual(
    resolveOrderBatchLifecycle({ mode: 'church_batch', orderStatus: 'in_production', items, assignments: [{ itemIndex: 0, quantity: 1, batchStatus: 'received' }, { itemIndex: 0, quantity: 2, batchStatus: 'completed' }] }),
    { orderStatus: 'ready_for_pickup', fulfillmentStatus: 'ready_for_pickup' }
  );
});

test('refund-after-submission alert aggregates split assignments by batch', () => {
  const alerts = computeOperationalAlerts({ orders: [{ sessionId: 'cs_refund', campaignId: 'CAM-1', status: 'refunded_or_disputed', fulfillment: { mode: 'church_batch' }, batchAssignments: [{ batchId: 'B1', batchStatus: 'submitted', quantity: 2 }, { batchId: 'B1', batchStatus: 'submitted', quantity: 3 }] }] }, new Date('2026-08-11T12:00:00Z'));
  const matching = alerts.filter((item) => item.type === 'batch-reconciliation' && item.batchId === 'B1');
  assert.equal(matching.length, 1);
  assert.equal(matching[0].quantity, 5);
  assert.match(matching[0].message, /5 unit/);
});

test('pickup window cannot begin while campaign ordering is still open', () => {
  const readiness = churchBatchReadiness({ ...campaign, churchBatch: { ...pickup, pickupStartAt: '2026-08-30T12:00:00.000Z', pickupEndAt: '2026-09-01T12:00:00.000Z' } });
  assert.equal(readiness.complete, false);
  assert.match(readiness.errors.join(' '), /Pickup-window start cannot occur before the campaign ordering period ends/);
});

test('checkout draft owns the pickup code used by paid fulfillment', () => {
  const checkout = fs.readFileSync(new URL('../netlify/functions/create-checkout-session.mjs', import.meta.url), 'utf8');
  const fulfill = fs.readFileSync(new URL('../netlify/functions/_shared/fulfill.mjs', import.meta.url), 'utf8');
  assert.match(checkout, /const pickupCode = fulfillmentMode === 'church_batch' \? stablePickupCode\(''\) : ''/);
  assert.match(checkout, /fulfillment, pickupCode, status: 'created'/);
  assert.match(fulfill, /stablePickupCode\(draft\.pickupCode \|\| existing\?\.pickupCode \|\| ''\)/);
});

test('batch assembly and generic editing enforce concurrency and immutable production obligations', () => {
  const builder = fs.readFileSync(new URL('../netlify/functions/admin-build-church-batch.mjs', import.meta.url), 'utf8');
  const saver = fs.readFileSync(new URL('../netlify/functions/admin-save-batch.mjs', import.meta.url), 'utf8');
  const sync = fs.readFileSync(new URL('../netlify/functions/_shared/batch-sync.mjs', import.meta.url), 'utf8');
  assert.match(builder, /lock-church-pickup-/);
  assert.match(builder, /onlyIfNew: true/);
  assert.match(saver, /managed only through Build or Refresh Church Pickup Batch/);
  assert.match(saver, /entry\.data\.destination \|\| pickupDestinationSnapshot/);
  assert.match(sync, /assignment\.sourceItemId === item\.sourceItemId && assignment\.batchId === batch\.id/);
});

test('generic order editor cannot bypass church pickup lifecycle authority', () => {
  const updater = fs.readFileSync(new URL('../netlify/functions/admin-update-order.mjs', import.meta.url), 'utf8');
  assert.match(updater, /controlled by production batches and the pickup handoff workflow/);
  assert.match(updater, /\['cancelled', 'exception'\]/);
});
