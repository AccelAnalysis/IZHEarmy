import test from 'node:test';
import assert from 'node:assert/strict';
import { mediaMayBePublished, validateMediaMetadata } from '../netlify/functions/_shared/media-rules.mjs';
import { SOURCE_MEDIA_LIBRARY } from '../netlify/functions/_shared/source-media-library.mjs';

test('media metadata normalizes dimensions, tags, and orientation', () => {
  const record = validateMediaMetadata({
    title: '  Story photo  ',
    alt: 'A person wearing an IZHE shirt',
    category: 'model_lifestyle',
    usageStatus: 'draft',
    rightsStatus: 'pending_release',
    productAccuracyStatus: 'legacy_or_unverified',
    tags: ' Collection 1, Story, collection 1 ',
    width: '3024',
    height: '4032'
  });
  assert.equal(record.title, 'Story photo');
  assert.equal(record.orientation, 'portrait');
  assert.deepEqual(record.tags, ['collection-1', 'story']);
});

test('media metadata requires accessible alt text', () => {
  assert.throws(() => validateMediaMetadata({ title: 'Missing alt' }), /Accessible alt text/);
});

test('governed publishing rejects unapproved or unreleased media', () => {
  assert.equal(mediaMayBePublished({ usageStatus: 'draft', rightsStatus: 'owned_no_people', category: 'general', productAccuracyStatus: 'not_applicable' }), false);
  assert.equal(mediaMayBePublished({ usageStatus: 'approved', rightsStatus: 'pending_release', category: 'model_lifestyle', productAccuracyStatus: 'not_applicable' }), false);
});

test('governed publishing requires accurate apparel product imagery', () => {
  assert.equal(mediaMayBePublished({ usageStatus: 'approved', rightsStatus: 'owned_no_people', category: 'apparel_product', productAccuracyStatus: 'concept_only' }), false);
  assert.equal(mediaMayBePublished({ usageStatus: 'approved', rightsStatus: 'owned_no_people', category: 'apparel_product', productAccuracyStatus: 'accurate' }), true);
});

test('approved non-product media with verified rights may publish', () => {
  assert.equal(mediaMayBePublished({ usageStatus: 'approved', rightsStatus: 'release_on_file', category: 'model_lifestyle', productAccuracyStatus: 'not_applicable' }), true);
  assert.equal(mediaMayBePublished({ usageStatus: 'approved', rightsStatus: 'licensed', category: 'teaching', productAccuracyStatus: 'not_applicable' }), true);
});

test('generated source media manifest contains 25 unique optimized assets', () => {
  assert.equal(SOURCE_MEDIA_LIBRARY.length, 25);
  assert.equal(new Set(SOURCE_MEDIA_LIBRARY.map((item) => item.id)).size, 25);
  assert.equal(new Set(SOURCE_MEDIA_LIBRARY.map((item) => item.url)).size, 25);
  assert.ok(SOURCE_MEDIA_LIBRARY.every((item) => item.url.startsWith('/assets/media/izhe/') && item.url.endsWith('.webp')));
  assert.ok(SOURCE_MEDIA_LIBRARY.every((item) => item.sourceOriginalPath.startsWith('IZHE Resource Folder/originals/')));
});
