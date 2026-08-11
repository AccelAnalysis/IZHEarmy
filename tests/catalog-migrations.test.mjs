import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CATALOG } from '../netlify/functions/_shared/catalog-defaults.mjs';
import {
  applyCatalogMigrations,
  STAPLE_PLACEHOLDER_MIGRATION_ID,
  STAPLE_PLACEHOLDER_PRODUCTS,
  SUPPORT_ELIGIBILITY_MIGRATION_ID
} from '../netlify/functions/_shared/catalog-migrations.mjs';
import { publicCatalog, validateCatalog } from '../netlify/functions/_shared/catalog-rules.mjs';

function catalogWithStapleCollection() {
  return validateCatalog({
    ...structuredClone(DEFAULT_CATALOG),
    appliedMigrations: [],
    collections: [
      ...structuredClone(DEFAULT_CATALOG.collections),
      {
        id: 'staple_collection',
        slug: 'staple-collection',
        title: 'Staple Collection',
        shortTitle: 'Staple Collection',
        subtitle: '',
        description: '',
        bookTitle: '',
        bookSubtitle: '',
        status: 'published',
        availabilityStatus: 'available',
        availableFrom: '',
        availableUntil: '',
        displayOrder: 2,
        heroImage: ''
      }
    ]
  });
}

test('does not mark the Staple migration before the collection exists while applying independent support eligibility migration', () => {
  const catalog = validateCatalog(structuredClone(DEFAULT_CATALOG));
  const result = applyCatalogMigrations(catalog, { now: '2026-08-10T00:00:00.000Z' });
  assert.equal(result.changed, true);
  assert.deepEqual(result.addedProductIds, []);
  assert.equal(result.catalog.appliedMigrations.includes(SUPPORT_ELIGIBILITY_MIGRATION_ID), true);
  assert.equal(result.catalog.appliedMigrations.includes(STAPLE_PLACEHOLDER_MIGRATION_ID), false);
});

test('adds seven safe draft placeholders to the Staple Collection', () => {
  const catalog = catalogWithStapleCollection();
  const result = applyCatalogMigrations(catalog, { now: '2026-08-10T00:00:00.000Z' });
  const validated = validateCatalog(result.catalog);
  const staples = validated.products.filter((product) => product.collectionId === 'staple_collection');

  assert.equal(result.changed, true);
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.addedProductIds.length, 7);
  assert.equal(staples.length, 7);
  assert.deepEqual(staples.map((product) => product.name), STAPLE_PLACEHOLDER_PRODUCTS.map((product) => product.name));
  assert.ok(staples.every((product) => product.status === 'draft'));
  assert.ok(staples.every((product) => product.availabilityStatus === 'paused'));
  assert.ok(staples.every((product) => product.images.length === 0));
  assert.ok(staples.every((product) => product.variants.length === 6));
  assert.ok(staples.every((product) => product.variants.every((variant) => variant.availabilityStatus === 'paused')));
  assert.ok(staples.every((product) => product.supportEligible === true));
  assert.ok(validated.appliedMigrations.includes(STAPLE_PLACEHOLDER_MIGRATION_ID));
  assert.ok(validated.appliedMigrations.includes(SUPPORT_ELIGIBILITY_MIGRATION_ID));
  assert.equal(publicCatalog(validated).products.some((product) => product.collectionId === 'staple_collection'), false);
});

test('is idempotent after the Staple placeholders are applied', () => {
  const first = applyCatalogMigrations(catalogWithStapleCollection(), { now: '2026-08-10T00:00:00.000Z' });
  const second = applyCatalogMigrations(validateCatalog(first.catalog), { now: '2026-08-11T00:00:00.000Z' });

  assert.equal(second.changed, false);
  assert.deepEqual(second.addedProductIds, []);
  assert.equal(second.catalog.products.filter((product) => product.collectionId === 'staple_collection').length, 7);
});

test('keeps a manually created matching product and adds only the missing placeholders', () => {
  const catalog = catalogWithStapleCollection();
  catalog.products.push({
    id: 'manual-your-friend',
    collectionId: 'staple_collection',
    displayGroup: 'manual-your-friend',
    displayOrder: 10,
    sku: 'IZHE-MANUAL-YOUR-FRIEND',
    name: 'Your Friend',
    shortName: 'Your Friend',
    description: 'Existing draft product.',
    productType: 'other',
    chapter: null,
    divineName: '',
    message: 'Your Friend',
    audience: 'all',
    audienceLabel: 'All',
    unitAmount: 3700,
    currency: 'usd',
    lookupKey: 'izhe_manual_your_friend_usd',
    supportEligible: false,
    giveOneEligible: true,
    giveOneUnitsPerPaidUnit: 1,
    status: 'draft',
    availabilityStatus: 'paused',
    availableFrom: '',
    availableUntil: '',
    featured: false,
    images: [],
    variants: []
  });

  const result = applyCatalogMigrations(validateCatalog(catalog), { now: '2026-08-10T00:00:00.000Z' });
  const staples = validateCatalog(result.catalog).products.filter((product) => product.collectionId === 'staple_collection');
  assert.equal(result.addedProductIds.length, 6);
  assert.equal(staples.length, 7);
  assert.equal(staples.filter((product) => product.name === 'Your Friend').length, 1);
});
