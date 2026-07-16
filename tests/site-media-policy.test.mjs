import test from 'node:test';
import assert from 'node:assert/strict';
import { applySourceMediaPolicy, isCatalogProductMedia, isEditorialSiteMedia, siteReadySourceIds, sourceMediaPolicy } from '../netlify/functions/_shared/site-media-policy.mjs';

test('site media policy promotes reviewed no-person source assets', () => {
  const item = {
    id: 'source-izhe-question-healer-blue',
    static: true,
    category: 'teaching',
    usageStatus: 'draft',
    rightsStatus: 'unverified',
    productAccuracyStatus: 'not_applicable',
    tags: ['izhe-source']
  };
  const result = applySourceMediaPolicy(item);
  assert.equal(result.usageStatus, 'approved');
  assert.equal(result.rightsStatus, 'owned_no_people');
  assert.equal(isEditorialSiteMedia(result), true);
  assert.equal(isCatalogProductMedia(result), true);
  assert.ok(result.tags.includes('site-ready'));
});

test('editorial apparel is usable on pages but not as current catalog product media', () => {
  const item = {
    id: 'source-izhe-white-blue-logo-tee-flatlay',
    static: true,
    category: 'apparel_product',
    usageStatus: 'draft',
    rightsStatus: 'unverified',
    productAccuracyStatus: 'legacy_or_unverified',
    tags: []
  };
  const result = applySourceMediaPolicy(item);
  assert.equal(isEditorialSiteMedia(result), true);
  assert.equal(isCatalogProductMedia(result), false);
  assert.ok(result.tags.includes('editorial-use-only'));
});

test('recognizable-person media is not auto-approved', () => {
  const item = {
    id: 'source-izhe-model-woman-white-logo-tee-front',
    static: true,
    category: 'model_lifestyle',
    usageStatus: 'draft',
    rightsStatus: 'pending_release',
    productAccuracyStatus: 'legacy_or_unverified'
  };
  assert.equal(sourceMediaPolicy(item), null);
  assert.equal(isEditorialSiteMedia(applySourceMediaPolicy(item)), false);
});

test('manual review overrides automatic source policy', () => {
  const item = {
    id: 'source-izhe-core-wordmark-blue',
    static: true,
    category: 'brand_mark',
    usageStatus: 'draft',
    rightsStatus: 'unverified',
    productAccuracyStatus: 'not_applicable'
  };
  const result = applySourceMediaPolicy(item, { usageStatus: 'restricted', rightsStatus: 'restricted', reviewSource: 'manual' });
  assert.equal(result.usageStatus, 'restricted');
  assert.equal(result.rightsStatus, 'restricted');
});

test('eleven source assets are processed as site-ready', () => {
  assert.equal(siteReadySourceIds().length, 11);
});
