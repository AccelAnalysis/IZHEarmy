import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SOURCE_MEDIA_LIBRARY } from '../netlify/functions/_shared/source-media-library.mjs';
import { NAMES_OF_GOD_SOURCE_MEDIA_LIBRARY, applyNamesOfGodSourceMediaMetadata } from '../netlify/functions/_shared/names-of-god-source-media-library.mjs';
import { isCatalogProductMedia, sourceMediaPolicy } from '../netlify/functions/_shared/site-media-policy.mjs';

const SUPPLEMENTAL_IDS = [
  'source-izhe-question-above-all-blue',
  'source-izhe-question-alive-blue',
  'source-izhe-question-almighty-blue',
  'source-izhe-question-creator-blue',
  'source-izhe-question-enough-blue',
  'source-izhe-question-fighting-for-you-blue',
  'source-izhe-question-the-one-who-is-blue',
  'source-izhe-question-mighty-blue',
  'source-izhe-question-lord-standalone-blue',
  'source-izhe-question-lord-of-lords-blue',
  'source-izhe-question-i-am-blue'
];

const FRIEND_ID = 'source-izhe-question-friend-blue';

test('eleven supplemental Names of God marks are registered as distinct teaching media', () => {
  assert.equal(NAMES_OF_GOD_SOURCE_MEDIA_LIBRARY.length, 11);
  assert.deepEqual(NAMES_OF_GOD_SOURCE_MEDIA_LIBRARY.map((item) => item.id), SUPPLEMENTAL_IDS);
  assert.equal(new Set(NAMES_OF_GOD_SOURCE_MEDIA_LIBRARY.map((item) => item.url)).size, 11);
  for (const item of NAMES_OF_GOD_SOURCE_MEDIA_LIBRARY) {
    assert.equal(item.category, 'teaching');
    assert.equal(item.orientation, 'square');
    assert.equal(item.static, true);
    assert.ok(item.tags.includes('names-of-god'));
    assert.ok(item.tags.includes('give-one-catalogue'));
    assert.match(item.url, /^\/assets\/media\/izhe\/.+\.svg$/);
    assert.ok(fs.existsSync(new URL(`../public${item.url}`, import.meta.url)), `Missing ${item.url}`);
  }
});

test('existing Your Friend artwork is enriched rather than duplicated', () => {
  const original = SOURCE_MEDIA_LIBRARY.find((item) => item.id === FRIEND_ID);
  assert.ok(original, 'Expected the governed Your Friend source asset');
  const enriched = applyNamesOfGodSourceMediaMetadata(original);
  assert.equal(enriched.id, FRIEND_ID);
  assert.equal(enriched.url, original.url);
  assert.equal(enriched.title, 'IZHE Your Friend? teaching mark');
  assert.ok(enriched.tags.includes('names-of-god'));
  assert.ok(enriched.tags.includes('give-one-catalogue'));
  assert.equal(NAMES_OF_GOD_SOURCE_MEDIA_LIBRARY.some((item) => item.id === FRIEND_ID), false);
});

test('all twelve supplied Names of God / Give One marks have governed media records', () => {
  const friend = applyNamesOfGodSourceMediaMetadata(SOURCE_MEDIA_LIBRARY.find((item) => item.id === FRIEND_ID));
  const twelve = [friend, ...NAMES_OF_GOD_SOURCE_MEDIA_LIBRARY];
  assert.equal(twelve.length, 12);
  assert.equal(new Set(twelve.map((item) => item.id)).size, 12);
  for (const item of twelve) {
    const policy = sourceMediaPolicy(item);
    assert.equal(policy?.usageStatus, 'approved');
    assert.equal(policy?.rightsStatus, 'owned_no_people');
    assert.ok(policy?.tags.includes('site-ready'));
    assert.equal(isCatalogProductMedia({ ...item, ...policy }), true);
  }
});
