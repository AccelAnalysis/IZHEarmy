import test from 'node:test';
import assert from 'node:assert/strict';
import { contentIsLive, publicContent, validateContentRecord } from '../netlify/functions/_shared/content-rules.mjs';
import { publicTeaching, validateBook, validateChapter, validateResource } from '../netlify/functions/_shared/teaching-rules.mjs';
import { campaignAccountability, organizationAccountability, validateLedgerEntry } from '../netlify/functions/_shared/accountability-rules.mjs';

const now = new Date('2026-07-14T12:00:00.000Z');

test('structured content honors publishing windows and preview mode', () => {
  const record = validateContentRecord({ key: 'home-hero', status: 'scheduled', publishAt: '2026-07-14T10:00:00.000Z', unpublishAt: '2026-07-15T10:00:00.000Z', fields: { eyebrow: 'Question', question: 'Who is God to you?' } });
  assert.equal(contentIsLive(record, now), true);
  assert.equal(contentIsLive({ ...record, publishAt: '2026-07-15T12:00:00.000Z' }, now), false);
  const library = { revision: 2, records: [record, { ...record, key: 'home-story', status: 'draft' }] };
  assert.equal(Object.keys(publicContent(library, { now }).records).length, 1);
  assert.equal(Object.keys(publicContent(library, { preview: true, now }).records).length, 2);
});

test('teaching library validates relationships and public access', () => {
  const book = validateBook({ id: 'book-1', title: 'Who Is God to You?', status: 'published' });
  const chapter = validateChapter({ id: 'chapter-1', bookId: book.id, title: 'YHWH', chapterNumber: 1, status: 'published' }, [book]);
  const publicResource = validateResource({ id: 'resource-1', title: 'Overview', bookId: book.id, chapterId: chapter.id, type: 'teaching_outline', access: 'public', status: 'published' }, [book], [chapter]);
  const privateResource = validateResource({ id: 'resource-2', title: 'Leader Notes', bookId: book.id, type: 'speaker_notes', access: 'church_leaders', status: 'published' }, [book], [chapter]);
  const library = { revision: 1, books: [book], chapters: [chapter], resources: [publicResource, privateResource] };
  assert.equal(publicTeaching(library).resources.length, 1);
  assert.equal(publicTeaching(library, { preview: true }).resources.length, 2);
  assert.throws(() => validateChapter({ id: 'bad', bookId: 'missing', title: 'Bad' }, [book]), /valid book/);
});

test('mission accountability separates accrued, paid, costs, and gift obligations', () => {
  const campaign = { id: 'CAM-1', organization: 'Church One', title: 'Campaign', status: 'active', supportModel: 'percentage', supportRate: 10, goalUnits: 0, goalAmount: 0 };
  const records = {
    orders: [{ campaignId: 'CAM-1', status: 'paid', amountTotal: 5500, items: [{ unitAmount: 2500, quantity: 2 }] }],
    codes: [{ campaignId: 'CAM-1', status: 'active', createdAt: '2026-07-01T00:00:00Z' }, { campaignId: 'CAM-1', status: 'redeemed' }],
    redemptions: [{ campaignId: 'CAM-1', status: 'fulfilled' }, { campaignId: 'CAM-1', status: 'pending_fulfillment' }],
    batches: []
  };
  const ledger = [
    { campaignId: 'CAM-1', type: 'support_adjustment', amount: 100 },
    { campaignId: 'CAM-1', type: 'support_payment', amount: 400 },
    { campaignId: 'CAM-1', type: 'campaign_cost', amount: 1200 }
  ];
  const report = campaignAccountability(campaign, records, ledger);
  assert.equal(report.merchandiseRevenue, 5000);
  assert.equal(report.grossCollected, 5500);
  assert.equal(report.supportCalculated, 500);
  assert.equal(report.supportAccrued, 600);
  assert.equal(report.supportPaid, 400);
  assert.equal(report.supportOutstanding, 200);
  assert.equal(report.campaignCosts, 1200);
  assert.equal(report.activeGiftObligations, 1);
  assert.equal(report.pendingGiftFulfillment, 1);
  assert.equal(report.fulfilledGifts, 1);
  const organization = organizationAccountability([campaign], records, ledger);
  assert.equal(organization.summary.supportOutstanding, 200);
});

test('ledger validation requires a financial amount except for notes', () => {
  const campaigns = [{ id: 'CAM-1' }];
  assert.throws(() => validateLedgerEntry({ campaignId: 'CAM-1', type: 'support_payment', amount: 0 }, campaigns), /non-zero/);
  const note = validateLedgerEntry({ campaignId: 'CAM-1', type: 'accountability_note', amount: 0, note: 'Settlement reviewed.' }, campaigns);
  assert.equal(note.amount, 0);
});
