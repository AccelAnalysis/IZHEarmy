import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateSupportAmount,
  campaignAllowsProduct,
  campaignIsPublic,
  campaignIsPurchasable,
  computeCampaignMetrics,
  validateCampaign,
  validateInquiry
} from '../netlify/functions/_shared/campaign-rules.mjs';

const catalog = {
  collections: [{ id: 'collection_1' }, { id: 'collection_2' }],
  products: [{ id: 'shirt-1', collectionId: 'collection_1' }, { id: 'shirt-2', collectionId: 'collection_2' }]
};
const churchBatch = {
  pickupLocationName: 'Church One', address1: '100 Main St', address2: '', city: 'Smithfield', state: 'VA', postalCode: '23430', country: 'US',
  publicInstructions: 'Bring your confirmation code.', internalInstructions: '', estimatedReadyAt: '2026-08-01T12:00:00.000Z', pickupStartAt: '2026-08-02T12:00:00.000Z', pickupEndAt: '2026-08-03T20:00:00.000Z', contactName: '', contactEmail: '', contactPhone: ''
};
const baseCampaign = {
  id: 'CAM-1', slug: 'church-one', title: 'Church One Campaign', organization: 'Church One', collectionIds: ['collection_1'], productIds: [], status: 'active', publishStatus: 'published',
  fulfillmentMethod: 'church_batch', churchBatch, supportModel: 'percentage', supportRate: 10, startAt: '2026-07-01T00:00:00.000Z', endAt: '2026-07-31T23:59:59.000Z'
};
const percentagePolicy = {
  campaignId: 'CAM-1', policyId: 'CAM-1:support', policyVersion: 'CAM-1:support:v1', version: 1,
  supportModel: 'percentage', supportRate: 10, currency: 'usd', eligibleProductBasis: 'explicit_support_eligible_snapshot',
  eligibleUnitBasis: 'settled_whole_support_eligible_units', calculationPolicyVersion: 'eligible-settlement-v1'
};

function paidPayment(totalCharged, merchandiseGross) {
  return {
    captureStatus: 'paid', refundStatus: 'none', disputeStatus: 'none', reconciliationStatus: 'reconciled', currency: 'usd',
    amounts: {
      merchandiseGross, discountTotal: 0, merchandiseNetBeforeRefunds: merchandiseGross, merchandiseRefunded: 0,
      shippingCollected: totalCharged - merchandiseGross, shippingRefunded: 0, taxCollected: 0, taxRefunded: 0,
      totalCharged, totalRefunded: 0, refundUnallocated: 0, openDisputeAmount: 0, lostDisputeAmount: 0,
      netCollected: totalCharged, amountHeld: 0, availableAfterHolds: totalCharged
    }
  };
}

function line(lineId, unitAmount, quantity) {
  const gross = unitAmount * quantity;
  return {
    lineId, productId: 'shirt-1', quantityPurchased: quantity, grossMerchandiseAmount: gross, allocatedDiscount: 0,
    netMerchandiseBeforeRefunds: gross, allocatedMerchandiseRefund: 0, netRecognizedMerchandiseRevenue: gross,
    supportEligible: true, supportEligibleQuantity: quantity, giveOneEligible: true, giveOneUnitsPerPaidUnit: 1,
    allocatedWholeUnitReversals: [], unresolvedAllocationAmount: 0, reconciliationState: 'reconciled'
  };
}

test('campaign restricts products by selected collections and products', () => {
  assert.equal(campaignAllowsProduct(baseCampaign, catalog.products[0]), true);
  assert.equal(campaignAllowsProduct(baseCampaign, catalog.products[1]), false);
  assert.equal(campaignAllowsProduct({ ...baseCampaign, productIds: ['shirt-2'], collectionIds: [] }, catalog.products[1]), true);
});

test('campaign page remains visible while ordering windows are enforced', () => {
  const during = new Date('2026-07-14T12:00:00.000Z');
  assert.equal(campaignIsPublic(baseCampaign), true);
  assert.equal(campaignIsPurchasable(baseCampaign, during), true);
  assert.equal(campaignIsPurchasable(baseCampaign, new Date('2026-06-30T12:00:00.000Z')), false);
  assert.equal(campaignIsPurchasable(baseCampaign, new Date('2026-08-04T12:00:00.000Z')), false);
  assert.equal(campaignIsPublic({ ...baseCampaign, publishStatus: 'draft' }), false);
});

test('individual shipping does not require church pickup configuration', () => {
  const clean = validateCampaign({ ...baseCampaign, fulfillmentMethod: 'individual_shipping', churchBatch: undefined }, catalog);
  assert.equal(clean.fulfillmentMethod, 'individual_shipping');
  assert.equal(clean.churchBatch.pickupLocationName, '');
});

test('church-batch and hybrid campaigns require complete pickup data before active publication', () => {
  for (const fulfillmentMethod of ['church_batch', 'hybrid']) {
    assert.throws(() => validateCampaign({ ...baseCampaign, fulfillmentMethod, churchBatch: {} }, catalog), /cannot accept church-pickup orders/);
    const clean = validateCampaign({ ...baseCampaign, fulfillmentMethod }, catalog);
    assert.equal(clean.churchBatch.pickupLocationName, 'Church One');
  }
});

test('pickup state, ZIP, and dates are validated', () => {
  assert.throws(() => validateCampaign({ ...baseCampaign, churchBatch: { ...churchBatch, state: 'Virginia' } }, catalog), /state/);
  assert.throws(() => validateCampaign({ ...baseCampaign, churchBatch: { ...churchBatch, postalCode: '2343' } }, catalog), /ZIP/);
  assert.throws(() => validateCampaign({ ...baseCampaign, churchBatch: { ...churchBatch, pickupStartAt: '2026-08-04T12:00:00Z', pickupEndAt: '2026-08-03T12:00:00Z' } }, catalog), /later/);
});

test('draft batch campaign may save incomplete configuration but is not purchasable', () => {
  const clean = validateCampaign({ ...baseCampaign, status: 'planning', publishStatus: 'draft', churchBatch: {} }, catalog);
  assert.equal(clean.churchBatch.pickupLocationName, '');
  assert.equal(campaignIsPurchasable({ ...clean, status: 'active', publishStatus: 'published' }, new Date('2026-07-14T12:00:00Z')), false);
});

test('legacy individual-shipping campaign loads with a safe empty churchBatch object', () => {
  const legacy = { ...baseCampaign, fulfillmentMethod: 'individual_shipping', churchBatch: undefined, status: 'planning', publishStatus: 'draft' };
  const clean = validateCampaign(legacy, catalog);
  assert.equal(clean.churchBatch.country, 'US');
  assert.equal(clean.churchBatch.publicInstructions, '');
});

test('campaign support models calculate in cents and fixed support requires qualifying activity', () => {
  assert.equal(calculateSupportAmount(baseCampaign, { revenue: 10000, soldUnits: 4 }), 1000);
  assert.equal(calculateSupportAmount({ ...baseCampaign, supportModel: 'per_unit', supportRate: 250 }, { revenue: 10000, soldUnits: 4 }), 1000);
  assert.equal(calculateSupportAmount({ ...baseCampaign, supportModel: 'fixed', supportRate: 5000 }, { revenue: 10000, soldUnits: 4, qualifyingActivity: false }), 0);
  assert.equal(calculateSupportAmount({ ...baseCampaign, supportModel: 'fixed', supportRate: 5000 }, { revenue: 10000, soldUnits: 4, qualifyingActivity: true }), 5000);
});

test('campaign metrics use canonical paid settlement while keeping pickup operations separate from Give One', () => {
  const report = computeCampaignMetrics(baseCampaign, {
    orders: [
      {
        sessionId: 'cs1', campaignId: 'CAM-1', status: 'ready_for_pickup', paymentStatus: 'paid', payment: paidPayment(5000, 4000),
        supportPolicy: percentagePolicy, lineSettlements: [line('order:cs1:line:0', 2000, 2)],
        fulfillment: { mode: 'church_batch', status: 'ready_for_pickup' }, items: [{ unitAmount: 2000, quantity: 2 }],
        batchAssignments: [{ itemIndex: 0, quantity: 2, batchStatus: 'received' }]
      },
      {
        sessionId: 'cs2', campaignId: 'CAM-1', status: 'paid', paymentStatus: 'paid', payment: paidPayment(3000, 2500),
        supportPolicy: percentagePolicy, lineSettlements: [line('order:cs2:line:0', 2500, 1)],
        fulfillment: { mode: 'individual_shipping', status: 'paid' }, items: [{ unitAmount: 2500, quantity: 1 }]
      }
    ],
    codes: [{ campaignId: 'CAM-1', status: 'redeemed' }, { campaignId: 'CAM-1', status: 'active' }],
    redemptions: [{ campaignId: 'CAM-1', status: 'pending_fulfillment' }], batches: [{ campaignId: 'CAM-1', status: 'received' }]
  });
  assert.equal(report.orderCount, 2);
  assert.equal(report.revenue, 6500);
  assert.equal(report.grossCollected, 8000);
  assert.equal(report.soldUnits, 3);
  assert.equal(report.supportAmount, 650);
  assert.equal(report.reconciliationRequired, false);
  assert.equal(report.churchPickupOrderCount, 1);
  assert.equal(report.churchPickupUnitCount, 2);
  assert.equal(report.batchedChurchPickupUnits, 2);
  assert.equal(report.readyForPickupOrderCount, 1);
  assert.equal(report.directShippingOrderCount, 1);
  assert.equal(report.pendingFulfillmentCount, 1);
});

test('campaign validation rejects unknown catalog records', () => {
  assert.throws(() => validateCampaign({ ...baseCampaign, collectionIds: ['missing'] }, catalog), /unknown collection/);
  const clean = validateCampaign(baseCampaign, catalog);
  assert.equal(clean.slug, 'church-one');
  assert.equal(clean.organization, 'Church One');
});

test('inquiry validation creates an operational record', () => {
  const inquiry = validateInquiry({ organization: 'Church One', name: 'Pastor One', email: 'pastor@example.com', cause: 'Youth outreach' });
  assert.match(inquiry.id, /^INQ-/);
  assert.equal(inquiry.status, 'new');
  assert.equal(inquiry.ministryObjective, 'Youth outreach');
});
