import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildCheckoutSessionConfiguration,
  checkoutSessionTotals,
  churchBatchReadiness,
  createFulfillmentSnapshot,
  createPickupCode,
  emptyChurchBatch,
  publicFulfillmentProjection,
  resolveFulfillmentMode,
  resolvePickupHandoffTransition,
  stablePickupCode
} from '../netlify/functions/_shared/fulfillment-rules.mjs';
import {
  assembleChurchPickupItems,
  nextChurchBatchNumber,
  selectEditableChurchBatch,
  stableOrderSourceItems
} from '../netlify/functions/_shared/church-batch-rules.mjs';
import {
  appendStatusHistory,
  batchProductionSummary,
  computeOperationalAlerts,
  resolveOrderBatchLifecycle
} from '../netlify/functions/_shared/operations-rules.mjs';

const churchBatch = {
  pickupLocationName: 'New Hope Church', address1: '100 Main St', address2: '', city: 'Smithfield', state: 'VA', postalCode: '23430', country: 'US',
  publicInstructions: 'Bring your pickup code to the welcome desk.', internalInstructions: 'Receive at rear loading door.',
  estimatedReadyAt: '2026-09-05T14:00:00.000Z', pickupStartAt: '2026-09-06T14:00:00.000Z', pickupEndAt: '2026-09-07T22:00:00.000Z',
  contactName: 'Pickup Lead', contactEmail: 'pickup@example.com', contactPhone: '757-555-0100'
};
const campaign = { id: 'CAM-1', title: 'Who Is He Campaign', organization: 'New Hope Church', fulfillmentMethod: 'church_batch', startAt: '2026-08-01T00:00:00.000Z', endAt: '2026-08-31T23:59:59.000Z', churchBatch };

function checkoutConfig(mode) {
  return buildCheckoutSessionConfiguration({
    lineItems: [{ price: 'price_test', quantity: 1 }], successUrl: 'https://example.test/success', cancelUrl: 'https://example.test/cancel', metadata: { draftId: 'draft-1' },
    mode, campaign, shippingCents: 699
  });
}

test('fulfillment resolution is server authoritative', () => {
  assert.equal(resolveFulfillmentMode({ source: 'general_storefront', requestedMode: 'church_batch' }), 'individual_shipping');
  assert.equal(resolveFulfillmentMode({ source: 'campaign', campaignMethod: 'individual_shipping' }), 'individual_shipping');
  assert.throws(() => resolveFulfillmentMode({ source: 'campaign', campaignMethod: 'individual_shipping', requestedMode: 'church_batch' }), /not available/);
  assert.equal(resolveFulfillmentMode({ source: 'campaign', campaignMethod: 'church_batch' }), 'church_batch');
  assert.throws(() => resolveFulfillmentMode({ source: 'campaign', campaignMethod: 'church_batch', requestedMode: 'individual_shipping' }), /not available/);
  assert.throws(() => resolveFulfillmentMode({ source: 'campaign', campaignMethod: 'hybrid' }), /Choose church pickup/);
  assert.equal(resolveFulfillmentMode({ source: 'campaign', campaignMethod: 'hybrid', requestedMode: 'church_batch' }), 'church_batch');
  assert.equal(resolveFulfillmentMode({ source: 'campaign', campaignMethod: 'hybrid', requestedMode: 'individual_shipping' }), 'individual_shipping');
  assert.throws(() => resolveFulfillmentMode({ source: 'campaign', campaignMethod: 'hybrid', requestedMode: 'freight' }), /not supported/);
});

test('Stripe Session configuration distinguishes shipping from church pickup', () => {
  const shipping = checkoutConfig('individual_shipping');
  assert.deepEqual(shipping.shipping_address_collection, { allowed_countries: ['US'] });
  assert.equal(shipping.shipping_options[0].shipping_rate_data.fixed_amount.amount, 699);
  assert.equal(shipping.billing_address_collection, 'auto');
  assert.equal(shipping.automatic_tax.enabled, true);

  const pickup = checkoutConfig('church_batch');
  assert.equal('shipping_address_collection' in pickup, false);
  assert.equal('shipping_options' in pickup, false);
  assert.equal(pickup.billing_address_collection, 'required');
  assert.equal(pickup.automatic_tax.enabled, true);
  assert.match(pickup.custom_text.submit.message, /No individual shipment/);
  assert.match(pickup.custom_text.submit.message, /Church pickup/);
});

test('checkout totals persist Stripe values and force pickup shipping to zero', () => {
  const session = { amount_subtotal: 5000, amount_total: 5480, currency: 'usd', total_details: { amount_shipping: 699, amount_tax: 480, amount_discount: 699 } };
  assert.deepEqual(checkoutSessionTotals(session, 'church_batch'), { amountSubtotal: 5000, amountShipping: 0, amountTax: 480, amountDiscount: 699, amountTotal: 5480, currency: 'usd' });
  assert.equal(checkoutSessionTotals(session, 'individual_shipping').amountShipping, 699);
});

test('church-pickup snapshot is an immutable copy of the campaign promise', () => {
  const snapshot = createFulfillmentSnapshot({ campaign, mode: 'church_batch', source: 'campaign' });
  assert.equal(snapshot.status, 'awaiting_batch');
  assert.equal(snapshot.pickupLocation.pickupLocationName, 'New Hope Church');
  const changed = structuredClone(campaign);
  changed.churchBatch.pickupLocationName = 'Changed Later';
  assert.equal(snapshot.pickupLocation.pickupLocationName, 'New Hope Church');
});

test('pickup codes are human-readable, cryptographically-sized, and stable once assigned', () => {
  const code = createPickupCode(() => Buffer.from('a1b2c3d4e5f6', 'hex'));
  assert.equal(code, 'PICK-A1B2-C3D4-E5F6');
  assert.equal(stablePickupCode(code, () => { throw new Error('must not regenerate'); }), code);
});

test('public fulfillment projection excludes internal instructions and contacts', () => {
  const projection = publicFulfillmentProjection(campaign);
  assert.equal(projection.campaignMethod, 'church_batch');
  assert.deepEqual(projection.availableModes, ['church_batch']);
  assert.equal(projection.ready, true);
  assert.equal(projection.churchBatch.pickupLocationName, 'New Hope Church');
  assert.equal('internalInstructions' in projection.churchBatch, false);
  assert.equal('contactEmail' in projection.churchBatch, false);
  assert.equal('contactPhone' in projection.churchBatch, false);
  assert.equal(JSON.stringify(projection).includes('PICK-'), false);
});

test('readiness treats individual shipping as complete and pickup campaigns as configuration-bound', () => {
  assert.equal(churchBatchReadiness({ fulfillmentMethod: 'individual_shipping' }).complete, true);
  const incomplete = churchBatchReadiness({ fulfillmentMethod: 'church_batch', churchBatch: emptyChurchBatch() });
  assert.equal(incomplete.complete, false);
  assert.match(incomplete.errors.join(' '), /Pickup address is required/);
});

test('batch assembly includes only paid church-pickup campaign order items', () => {
  const base = { sessionId: 'cs_pickup', campaignId: 'CAM-1', paymentStatus: 'paid', status: 'paid', fulfillment: { mode: 'church_batch' }, items: [{ productId: 'shirt', productName: 'Shirt', variantId: 'v1', variantSku: 'SHIRT-M', fit: 'Unisex', size: 'M', color: 'Black', quantity: 2 }] };
  const selection = assembleChurchPickupItems({
    campaign,
    orders: [
      base,
      { ...base, sessionId: 'cs_ship', fulfillment: { mode: 'individual_shipping' } },
      { ...base, sessionId: 'cs_other', campaignId: 'OTHER' },
      { ...base, sessionId: 'cs_refund', status: 'refunded_or_disputed' },
      { ...base, sessionId: 'cs_cancel', status: 'cancelled' },
      { ...base, sessionId: 'cs_review', status: 'refund_requires_review' }
    ],
    batches: []
  });
  assert.equal(selection.ordersIncluded, 1);
  assert.equal(selection.unitsIncluded, 2);
  assert.equal(selection.items[0].sourceItemId, 'order:cs_pickup:0');
  assert.ok(selection.excluded.some((item) => item.sessionId === 'cs_ship' && item.reasons.includes('not_church_pickup')));
  assert.ok(selection.excluded.some((item) => item.sessionId === 'cs_refund' && item.reasons.includes('refunded_or_disputed')));
});

test('previously allocated source items are not duplicated and editable batches are selected safely', () => {
  const order = { sessionId: 'cs_1', campaignId: 'CAM-1', paymentStatus: 'paid', status: 'paid', fulfillment: { mode: 'church_batch' }, items: [{ productId: 'shirt', quantity: 1 }] };
  const [source] = stableOrderSourceItems(order);
  const submitted = { id: 'B1', batchType: 'campaign_church_pickup', campaignId: 'CAM-1', status: 'submitted', items: [source], createdAt: '2026-08-01T00:00:00Z' };
  const selection = assembleChurchPickupItems({ campaign, orders: [order], batches: [submitted] });
  assert.equal(selection.items.length, 0);
  assert.equal(selectEditableChurchBatch([submitted], 'CAM-1'), null);
  assert.equal(nextChurchBatchNumber([submitted], 'CAM-1'), 2);
  const draft = { ...submitted, id: 'B2', status: 'draft', items: [], createdAt: '2026-08-02T00:00:00Z' };
  assert.equal(selectEditableChurchBatch([submitted, draft], 'CAM-1').id, 'B2');
});

test('production summary aggregates exact variant and SKU quantities', () => {
  const summary = batchProductionSummary([
    { productId: 'p1', productName: 'Shirt', variantId: 'v1', variantSku: 'SKU-M', fit: 'Unisex', size: 'M', color: 'Black', quantity: 2 },
    { productId: 'p1', productName: 'Shirt', variantId: 'v1', variantSku: 'SKU-M', fit: 'Unisex', size: 'M', color: 'Black', quantity: 3 }
  ]);
  assert.equal(summary.length, 1);
  assert.equal(summary[0].sku, 'SKU-M');
  assert.equal(summary[0].quantity, 5);
});

test('batch lifecycle is fulfillment-mode aware', () => {
  const received = [{ itemIndex: 0, batchStatus: 'received' }];
  assert.deepEqual(resolveOrderBatchLifecycle({ mode: 'church_batch', orderStatus: 'allocated', itemCount: 1, assignments: received }), { orderStatus: 'ready_for_pickup', fulfillmentStatus: 'ready_for_pickup' });
  assert.deepEqual(resolveOrderBatchLifecycle({ mode: 'church_batch', orderStatus: 'allocated', itemCount: 1, assignments: [{ itemIndex: 0, batchStatus: 'completed' }] }), { orderStatus: 'ready_for_pickup', fulfillmentStatus: 'ready_for_pickup' });
  assert.deepEqual(resolveOrderBatchLifecycle({ mode: 'individual_shipping', orderStatus: 'allocated', itemCount: 1, assignments: received }), { orderStatus: 'ready_to_ship', fulfillmentStatus: 'ready_to_ship' });
  assert.deepEqual(resolveOrderBatchLifecycle({ mode: 'church_batch', orderStatus: 'allocated', itemCount: 1, assignments: [], remove: true }), { orderStatus: 'paid', fulfillmentStatus: 'awaiting_batch' });
});

test('status histories append operational transitions', () => {
  const history = appendStatusHistory({ statusHistory: [{ status: 'paid', at: '2026-08-01T00:00:00Z' }] }, 'ready_for_pickup', 'Batch received');
  assert.equal(history.at(-1).status, 'ready_for_pickup');
  assert.equal(history.at(-1).note, 'Batch received');
});

test('pickup handoff enforces readiness, duplicate prevention, and corrective notes', () => {
  assert.deepEqual(resolvePickupHandoffTransition({ currentStatus: 'ready_for_pickup', orderStatus: 'ready_for_pickup', action: 'picked_up', releasedBy: 'Jane' }), { orderStatus: 'completed', fulfillmentStatus: 'picked_up' });
  assert.throws(() => resolvePickupHandoffTransition({ currentStatus: 'allocated', orderStatus: 'allocated', action: 'picked_up', releasedBy: 'Jane' }), /ready for pickup/);
  assert.throws(() => resolvePickupHandoffTransition({ currentStatus: 'picked_up', orderStatus: 'completed', action: 'picked_up', releasedBy: 'Jane' }), /already/);
  assert.throws(() => resolvePickupHandoffTransition({ currentStatus: 'picked_up', orderStatus: 'completed', action: 'reverse_pickup' }), /corrective note/);
  assert.deepEqual(resolvePickupHandoffTransition({ currentStatus: 'picked_up', orderStatus: 'completed', action: 'reverse_pickup', note: 'Wrong order' }), { orderStatus: 'ready_for_pickup', fulfillmentStatus: 'ready_for_pickup' });
});

test('refund after submitted pickup batch creates a critical reconciliation alert', () => {
  const alerts = computeOperationalAlerts({
    orders: [{ sessionId: 'cs_refund', campaignId: 'CAM-1', status: 'refunded_or_disputed', fulfillment: { mode: 'church_batch' }, batchAssignments: [{ batchId: 'B1', batchStatus: 'submitted', quantity: 2 }] }],
    batches: [{ id: 'B1', batchType: 'campaign_church_pickup', campaignId: 'CAM-1', status: 'submitted', items: [{ sourceId: 'cs_refund', quantity: 2 }] }]
  }, new Date('2026-08-11T12:00:00Z'));
  const alert = alerts.find((item) => item.type === 'batch-reconciliation');
  assert.equal(alert?.severity, 'critical');
  assert.match(alert?.message || '', /B1/);
  assert.match(alert?.message || '', /2/);
});

test('pickup roster endpoint is administrator protected and Give One redemptions are not in automatic assembly', () => {
  const roster = fs.readFileSync(new URL('../netlify/functions/admin-pickup-roster.mjs', import.meta.url), 'utf8');
  const builder = fs.readFileSync(new URL('../netlify/functions/admin-build-church-batch.mjs', import.meta.url), 'utf8');
  const rules = fs.readFileSync(new URL('../netlify/functions/_shared/church-batch-rules.mjs', import.meta.url), 'utf8');
  assert.match(roster, /requireAdmin\(request\)/);
  assert.doesNotMatch(builder, /izhe-redemptions/);
  assert.match(rules, /sourceType: 'order'/);
});
