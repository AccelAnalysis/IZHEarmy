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
  products: [
    { id: 'shirt-1', collectionId: 'collection_1' },
    { id: 'shirt-2', collectionId: 'collection_2' }
  ]
};

const baseCampaign = {
  id: 'CAM-1',
  slug: 'church-one',
  title: 'Church One Campaign',
  organization: 'Church One',
  collectionIds: ['collection_1'],
  productIds: [],
  status: 'active',
  publishStatus: 'published',
  fulfillmentMethod: 'church_batch',
  supportModel: 'percentage',
  supportRate: 10,
  startAt: '2026-07-01T00:00:00.000Z',
  endAt: '2026-07-31T23:59:59.000Z'
};

test('campaign restricts products by selected collections and products', () => {
  assert.equal(campaignAllowsProduct(baseCampaign, catalog.products[0]), true);
  assert.equal(campaignAllowsProduct(baseCampaign, catalog.products[1]), false);
  assert.equal(campaignAllowsProduct({ ...baseCampaign, productIds: ['shirt-2'], collectionIds: [] }, catalog.products[1]), true);
});

test('campaign page remains visible while ordering windows are enforced', () => {
  const during = new Date('2026-07-14T12:00:00.000Z');
  const before = new Date('2026-06-30T12:00:00.000Z');
  const after = new Date('2026-08-01T12:00:00.000Z');
  assert.equal(campaignIsPublic(baseCampaign), true);
  assert.equal(campaignIsPurchasable(baseCampaign, during), true);
  assert.equal(campaignIsPurchasable(baseCampaign, before), false);
  assert.equal(campaignIsPurchasable(baseCampaign, after), false);
  assert.equal(campaignIsPublic({ ...baseCampaign, publishStatus: 'draft' }), false);
});

test('campaign support models calculate in cents', () => {
  assert.equal(calculateSupportAmount(baseCampaign, { revenue: 10000, soldUnits: 4 }), 1000);
  assert.equal(calculateSupportAmount({ ...baseCampaign, supportModel: 'per_unit', supportRate: 250 }, { revenue: 10000, soldUnits: 4 }), 1000);
  assert.equal(calculateSupportAmount({ ...baseCampaign, supportModel: 'fixed', supportRate: 5000 }, { revenue: 10000, soldUnits: 4 }), 5000);
});

test('campaign metrics use attributed merchandise revenue and retain gross collected', () => {
  const report = computeCampaignMetrics(baseCampaign, {
    orders: [
      { campaignId: 'CAM-1', status: 'paid', amountTotal: 5000, items: [{ unitAmount: 2000, quantity: 2 }] },
      { campaignId: 'OTHER', status: 'paid', amountTotal: 9000, items: [{ unitAmount: 9000, quantity: 1 }] }
    ],
    codes: [{ campaignId: 'CAM-1', status: 'redeemed' }, { campaignId: 'CAM-1', status: 'active' }],
    redemptions: [{ campaignId: 'CAM-1', status: 'pending_fulfillment' }],
    batches: [{ campaignId: 'CAM-1', status: 'ready' }]
  });
  assert.equal(report.orderCount, 1);
  assert.equal(report.revenue, 4000);
  assert.equal(report.grossCollected, 5000);
  assert.equal(report.supportAmount, 400);
  assert.equal(report.soldUnits, 2);
  assert.equal(report.codeCount, 2);
  assert.equal(report.claimRate, 50);
  assert.equal(report.pendingFulfillmentCount, 1);
  assert.equal(report.openBatchCount, 1);
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
