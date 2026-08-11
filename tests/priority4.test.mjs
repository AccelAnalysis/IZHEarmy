import test from 'node:test';
import assert from 'node:assert/strict';
import { contentIsLive, publicContent, validateContentRecord } from '../netlify/functions/_shared/content-rules.mjs';
import { publicTeaching, validateBook, validateChapter, validateResource } from '../netlify/functions/_shared/teaching-rules.mjs';
import { campaignAccountability, organizationAccountability, validateLedgerEntry } from '../netlify/functions/_shared/accountability-rules.mjs';

const now = new Date('2026-07-14T12:00:00.000Z');
const supportPolicy = {
  campaignId: 'CAM-1', policyId: 'CAM-1:support', policyVersion: 'CAM-1:support:v1', version: 1,
  supportModel: 'percentage', supportRate: 10, currency: 'usd', eligibleProductBasis: 'explicit_support_eligible_snapshot',
  eligibleUnitBasis: 'settled_whole_support_eligible_units', calculationPolicyVersion: 'eligible-settlement-v1'
};

function payment(amounts, overrides = {}) {
  return {
    captureStatus: 'paid', refundStatus: 'none', disputeStatus: 'none', reconciliationStatus: 'reconciled', currency: 'usd',
    amounts: {
      merchandiseGross: 0, discountTotal: 0, merchandiseNetBeforeRefunds: 0, merchandiseRefunded: 0,
      shippingCollected: 0, shippingRefunded: 0, taxCollected: 0, taxRefunded: 0, totalCharged: 0,
      totalRefunded: 0, refundUnallocated: 0, openDisputeAmount: 0, lostDisputeAmount: 0, netCollected: 0,
      amountHeld: 0, availableAfterHolds: 0, ...amounts
    },
    ...overrides
  };
}

function line(lineId, { quantity, gross, discount = 0, refund = 0 } = {}) {
  const beforeRefund = gross - discount;
  return {
    lineId, productId: 'shirt', productSnapshot: { name: 'Shirt' }, quantityPurchased: quantity,
    grossMerchandiseAmount: gross, allocatedDiscount: discount, netMerchandiseBeforeRefunds: beforeRefund,
    allocatedMerchandiseRefund: refund, netRecognizedMerchandiseRevenue: beforeRefund - refund,
    supportEligible: true, supportEligibleQuantity: quantity, giveOneEligible: true, giveOneUnitsPerPaidUnit: 1,
    allocatedWholeUnitReversals: [], unresolvedAllocationAmount: 0, reconciliationState: 'reconciled'
  };
}

test('structured content honors publishing windows and requires dates for scheduled records', () => {
  const record = validateContentRecord({ key: 'home-hero', status: 'scheduled', publishAt: '2026-07-14T10:00:00.000Z', unpublishAt: '2026-07-15T10:00:00.000Z', fields: { eyebrow: 'Question', question: 'Who is God to you?', primaryTarget: '#collection', secondaryTarget: '#story' } });
  assert.equal(contentIsLive(record, now), true);
  assert.equal(contentIsLive({ ...record, publishAt: '2026-07-15T12:00:00.000Z' }, now), false);
  assert.equal(contentIsLive({ ...record, publishAt: '' }, now), false);
  assert.throws(() => validateContentRecord({ key: 'home-hero', status: 'scheduled', fields: { question: 'Who?', primaryTarget: '#collection', secondaryTarget: '#story' } }), /requires a publication date/);
  assert.throws(() => validateContentRecord({ key: 'home-hero', status: 'scheduled', publishAt: '2026-07-15T00:00:00Z', unpublishAt: '2026-07-14T00:00:00Z', fields: { question: 'Who?', primaryTarget: '#collection', secondaryTarget: '#story' } }), /later than/);
  const library = { revision: 2, records: [record, { ...record, key: 'home-story', status: 'draft' }] };
  assert.equal(Object.keys(publicContent(library, { now }).records).length, 1);
  assert.equal(Object.keys(publicContent(library, { preview: true, now }).records).length, 2);
});

test('visual layout content only accepts governed presets', () => {
  const layout = validateContentRecord({
    key: 'site-layout', status: 'published', fields: {
      heroVisible: true, heroAlignment: 'center', heroHeight: 'standard', heroOverlay: 'medium', heroFocalPoint: 'right',
      storyVisible: true, storyOrder: 1, storyAlignment: 'left', storyImagePosition: 'right', storySpacing: 'generous',
      bookVisible: true, bookOrder: 2, bookAlignment: 'left', bookOverlay: 'strong', bookSpacing: 'standard',
      collectionVisible: true, collectionOrder: 3, collectionSpacing: 'compact',
      giveOneVisible: true, giveOneOrder: 4, giveOneAlignment: 'center', giveOneImagePosition: 'left', giveOneSpacing: 'standard',
      churchVisible: true, churchOrder: 5, churchAlignment: 'left', churchOverlay: 'strong', churchSpacing: 'generous'
    }
  });
  assert.equal(layout.fields.heroAlignment, 'center');
  assert.equal(layout.fields.storyImagePosition, 'right');
  assert.equal(layout.fields.collectionSpacing, 'compact');
  assert.throws(() => validateContentRecord({ key: 'site-layout', fields: { ...layout.fields, heroAlignment: 'absolute-position' } }), /valid hero alignment/);
  assert.throws(() => validateContentRecord({ key: 'site-layout', fields: { ...layout.fields, storyOrder: 99 } }), /no more than 20/);
});

test('teaching library validates schedules, relationships, and public access', () => {
  const book = validateBook({ id: 'book-1', title: 'Who Is God to You?', status: 'published' });
  const products = [{ id: 'shirt-1' }];
  const campaigns = [{ id: 'CAM-1' }];
  const chapter = validateChapter({ id: 'chapter-1', bookId: book.id, title: 'YHWH', chapterNumber: 1, relatedProductIds: ['shirt-1'], status: 'published' }, [book], null, products);
  const publicResource = validateResource({ id: 'resource-1', title: 'Overview', bookId: book.id, chapterId: chapter.id, campaignIds: ['CAM-1'], type: 'teaching_outline', access: 'public', status: 'published' }, [book], [chapter], null, campaigns);
  const privateResource = validateResource({ id: 'resource-2', title: 'Leader Notes', bookId: book.id, type: 'speaker_notes', access: 'church_leaders', status: 'published' }, [book], [chapter]);
  const library = { revision: 1, books: [book], chapters: [chapter], resources: [publicResource, privateResource] };
  assert.equal(publicTeaching(library).resources.length, 1);
  assert.equal(publicTeaching(library, { preview: true }).resources.length, 2);
  assert.throws(() => validateChapter({ id: 'bad', bookId: 'missing', title: 'Bad' }, [book]), /valid book/);
  assert.throws(() => validateChapter({ id: 'bad-product', bookId: book.id, title: 'Bad', relatedProductIds: ['missing'] }, [book], null, products), /Unknown related product/);
  assert.throws(() => validateResource({ id: 'bad-campaign', title: 'Bad', campaignIds: ['missing'] }, [book], [chapter], null, campaigns), /Unknown campaign/);
  assert.throws(() => validateBook({ id: 'scheduled-book', title: 'Scheduled', status: 'scheduled' }), /requires a publication date/);
});

test('mission accountability uses actual refund facts and separates support held, paid, and outstanding', () => {
  const campaign = { id: 'CAM-1', organization: 'Church One', title: 'Campaign', status: 'active', supportModel: 'percentage', supportRate: 10, goalUnits: 0, goalAmount: 0 };
  const records = {
    orders: [
      {
        sessionId: 'paid', campaignId: 'CAM-1', status: 'paid', createdAt: '2026-07-01T00:00:00Z', supportPolicy,
        payment: payment({
          merchandiseGross: 5000, discountTotal: 500, merchandiseNetBeforeRefunds: 4500, shippingCollected: 500, taxCollected: 300,
          totalCharged: 5300, netCollected: 5300, availableAfterHolds: 5300
        }),
        lineSettlements: [line('order:paid:line:0', { quantity: 2, gross: 5000, discount: 500 })]
      },
      {
        sessionId: 'review', campaignId: 'CAM-1', status: 'paid', createdAt: '2026-07-02T00:00:00Z', supportPolicy,
        payment: payment({
          merchandiseGross: 2500, merchandiseNetBeforeRefunds: 2500, totalCharged: 2500,
          totalRefunded: 500, refundUnallocated: 500, netCollected: 2000, amountHeld: 2000, availableAfterHolds: 0
        }, { refundStatus: 'allocation_required', reconciliationStatus: 'allocation_required' }),
        lineSettlements: [line('order:review:line:0', { quantity: 1, gross: 2500 })]
      }
    ],
    codes: [{ campaignId: 'CAM-1', status: 'active', createdAt: '2026-07-01T00:00:00Z' }, { campaignId: 'CAM-1', status: 'redeemed' }],
    redemptions: [{ campaignId: 'CAM-1', status: 'fulfilled' }, { campaignId: 'CAM-1', status: 'pending_fulfillment' }],
    batches: [{ id: 'B-1', campaignId: 'CAM-1', name: 'Batch', status: 'draft', items: [{ quantity: 3 }] }],
    reconciliationTasks: [], stripeEvents: [], workflows: []
  };
  const ledger = [
    { campaignId: 'CAM-1', type: 'support_adjustment', amount: 100, effectiveAt: '2026-07-01T00:00:00Z' },
    { campaignId: 'CAM-1', type: 'support_payment', amount: 400, effectiveAt: '2026-07-02T00:00:00Z' },
    { campaignId: 'CAM-1', type: 'campaign_cost', amount: 1200, effectiveAt: '2026-07-03T00:00:00Z' },
    { campaignId: 'CAM-1', type: 'campaign_settlement', amount: 0, settlementStatus: 'reconciled', effectiveAt: '2026-07-04T00:00:00Z' }
  ];
  const report = campaignAccountability(campaign, records, ledger);
  assert.equal(report.merchandiseGross, 7500);
  assert.equal(report.discountTotal, 500);
  assert.equal(report.merchandiseRevenue, 7000);
  assert.equal(report.grossCollected, 7800);
  assert.equal(report.totalRefunded, 500);
  assert.equal(report.refundsAndDisputes, 500);
  assert.equal(report.supportCalculated, 700);
  assert.equal(report.supportHeld, 50);
  assert.equal(report.supportAccrued, 800);
  assert.equal(report.supportAvailable, 750);
  assert.equal(report.supportPaid, 400);
  assert.equal(report.supportOutstanding, 350);
  assert.equal(report.campaignCosts, 1200);
  assert.equal(report.activeGiftObligations, 1);
  assert.equal(report.pendingGiftFulfillment, 1);
  assert.equal(report.fulfilledGifts, 1);
  assert.equal(report.underReconciliation, true);
  assert.equal(report.reconciliation.refundAllocationRequiredCount, 1);
  assert.equal(report.settlementStatus, 'reconciled');
  assert.equal(report.orderSummaries.length, 2);
  assert.equal(report.batchSummaries.length, 1);
});

test('organization accountability includes general ledger activity', () => {
  const records = { orders: [], codes: [], redemptions: [], batches: [] };
  const ledger = [
    { campaignId: '', type: 'support_adjustment', amount: 1000 },
    { campaignId: '', type: 'support_payment', amount: 250 },
    { campaignId: '', type: 'campaign_cost', amount: 300 }
  ];
  const organization = organizationAccountability([], records, ledger);
  assert.equal(organization.summary.supportAccrued, 1000);
  assert.equal(organization.summary.supportPaid, 250);
  assert.equal(organization.summary.supportOutstanding, 750);
  assert.equal(organization.summary.campaignCosts, 300);
  assert.equal(organization.general.entries.length, 3);
});

test('ledger validation requires amounts, explanations, idempotency facts, and valid settlements', () => {
  const campaigns = [{ id: 'CAM-1' }];
  assert.throws(() => validateLedgerEntry({ campaignId: 'CAM-1', type: 'support_payment', amount: 0 }, campaigns), /non-zero/);
  assert.throws(() => validateLedgerEntry({ campaignId: 'CAM-1', type: 'support_adjustment', amount: 100 }, campaigns), /explanation/);
  assert.throws(() => validateLedgerEntry({ campaignId: '', type: 'campaign_settlement', settlementStatus: 'closed' }, campaigns), /assigned to a campaign/);
  assert.throws(() => validateLedgerEntry({ campaignId: 'CAM-1', type: 'refund_adjustment', amount: 100 }, campaigns), /valid ledger entry type|Stripe refunds/);
  const note = validateLedgerEntry({ campaignId: 'CAM-1', type: 'accountability_note', amount: 0, note: 'Settlement reviewed.', idempotencyKey: 'note-1' }, campaigns);
  const settlement = validateLedgerEntry({ campaignId: 'CAM-1', type: 'campaign_settlement', amount: 0, settlementStatus: 'reconciled', idempotencyKey: 'settle-1' }, campaigns);
  assert.equal(note.amount, 0);
  assert.equal(note.actorType, 'admin-token');
  assert.equal(note.currency, 'usd');
  assert.equal(note.idempotencyKey, 'note-1');
  assert.equal(settlement.settlementStatus, 'reconciled');
});
