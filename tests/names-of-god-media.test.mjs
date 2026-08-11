import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { NAMES_OF_GOD_SOURCE_MEDIA_LIBRARY } from '../netlify/functions/_shared/names-of-god-source-media-library.mjs';
import { isCatalogProductMedia, sourceMediaPolicy } from '../netlify/functions/_shared/site-media-policy.mjs';

const EXPECTED_IDS = [
  'source-izhe-question-above-all-blue',
  'source-izhe-question-alive-blue',
  'source-izhe-question-almighty-blue',
  'source-izhe-question-creator-blue',
  'source-izhe-question-enough-blue',
  'source-izhe-question-fighting-for-you-blue'
];

test('six supplied Names of God marks are registered as distinct teaching media', () => {
  assert.equal(NAMES_OF_GOD_SOURCE_MEDIA_LIBRARY.length, 6);
  assert.deepEqual(NAMES_OF_GOD_SOURCE_MEDIA_LIBRARY.map((item) => item.id), EXPECTED_IDS);
  assert.equal(new Set(NAMES_OF_GOD_SOURCE_MEDIA_LIBRARY.map((item) => item.url)).size, 6);
  for (const item of NAMES_OF_GOD_SOURCE_MEDIA_LIBRARY) {
    assert.equal(item.category, 'teaching');
    assert.equal(item.orientation, 'square');
    assert.equal(item.static, true);
    assert.ok(item.tags.includes('names-of-god'));
    assert.ok(item.tags.includes('give-one-catalogue'));
    assert.ok(item.url.startsWith('/assets/media/izhe/') && item.url.endsWith('.svg'));
    assert.ok(fs.existsSync(new URL(`../public${item.url}`, import.meta.url)), `Missing ${item.url}`);
  }
});

test('six supplied marks are site-ready and selectable in governed media pickers', () => {
  for (const item of NAMES_OF_GOD_SOURCE_MEDIA_LIBRARY) {
    const policy = sourceMediaPolicy(item);
    assert.equal(policy?.usageStatus, 'approved');
    assert.equal(policy?.rightsStatus, 'owned_no_people');
    assert.ok(policy?.tags.includes('site-ready'));
    assert.equal(isCatalogProductMedia({ ...item, ...policy }), true);
  }
});
