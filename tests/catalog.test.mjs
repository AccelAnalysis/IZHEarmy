import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCart, cartTotal } from '../netlify/functions/_shared/catalog.mjs';
import { DEFAULT_CATALOG, DEFAULT_PRODUCTS } from '../netlify/functions/_shared/catalog-defaults.mjs';
import { publicCatalog, validateProduct } from '../netlify/functions/_shared/catalog-rules.mjs';
import { createGiveCode, normalizeCode } from '../netlify/functions/_shared/codes.mjs';

test('normalizes and merges matching product variants', () => {
  const cart = normalizeCart([
    { productId: 'c1-yhwh-adult', fit: 'Men', size: 'm', quantity: 1 },
    { productId: 'c1-yhwh-adult', variantId: 'men-m', quantity: 2 }
  ]);
  assert.deepEqual(cart, [{ productId: 'c1-yhwh-adult', variantId: 'men-m', fit: 'Men', size: 'M', color: 'Standard', quantity: 3 }]);
  assert.equal(cartTotal(cart), 11100);
});

test('rejects unavailable or invalid variants', () => {
  assert.throws(() => normalizeCart([{ productId: 'c1-yhwh-adult', fit: 'Men', size: '4XL', quantity: 1 }]), /available size and fit/);
  const paused = DEFAULT_PRODUCTS.map((product) => product.id === 'c1-yhwh-adult' ? { ...product, availabilityStatus: 'paused' } : product);
  assert.throws(() => normalizeCart([{ productId: 'c1-yhwh-adult', variantId: 'men-m', quantity: 1 }], paused), /no longer available/);
});

test('public catalog excludes drafts and marks paused products unavailable', () => {
  const catalog = structuredClone(DEFAULT_CATALOG);
  catalog.products[0].status = 'draft';
  catalog.products[1].availabilityStatus = 'paused';
  const result = publicCatalog(catalog);
  assert.equal(result.products.some((product) => product.id === catalog.products[0].id), false);
  assert.equal(result.products.find((product) => product.id === catalog.products[1].id).isPurchasable, false);
});

test('published apparel requires an image and variants', () => {
  const base = structuredClone(DEFAULT_PRODUCTS[0]);
  assert.throws(() => validateProduct({ ...base, images: [] }, DEFAULT_CATALOG.collections), /require at least one image/);
  assert.throws(() => validateProduct({ ...base, variants: [] }, DEFAULT_CATALOG.collections), /at least one variant/);
});

test('creates valid Give One code', () => {
  const code = createGiveCode();
  assert.match(code, /^IZHE-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  assert.equal(normalizeCode(code.toLowerCase()), code);
});
