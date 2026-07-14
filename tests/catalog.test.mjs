import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, normalizeCart, cartTotal } from '../netlify/functions/_shared/catalog.mjs';

test('catalog contains 24 shirt products and one book', () => {
  const products = Object.values(CATALOG);
  assert.equal(products.filter((product) => product.productType === 'apparel').length, 24);
  assert.equal(products.filter((product) => product.productType === 'book').length, 1);
  assert.equal(new Set(products.map((product) => product.lookupKey)).size, 25);
});

test('normalizes and merges matching apparel variants', () => {
  const cart = normalizeCart([
    { productId: 'c1-yhwh-adult', fit: 'men', size: 'm', quantity: 1 },
    { productId: 'c1-yhwh-adult', fit: 'Men', size: 'M', quantity: 2 }
  ]);
  assert.deepEqual(cart, [{ productId: 'c1-yhwh-adult', fit: 'Men', size: 'M', quantity: 3 }]);
  assert.equal(cartTotal(cart), 11100);
});

test('normalizes book without fit or size', () => {
  const cart = normalizeCart([{ productId: 'c1-book', quantity: 2 }]);
  assert.deepEqual(cart, [{ productId: 'c1-book', fit: '', size: '', quantity: 2 }]);
  assert.equal(cartTotal(cart), 4400);
});

test('rejects invalid fit and size', () => {
  assert.throws(() => normalizeCart([{ productId: 'c1-yhwh-adult', fit: 'Boys', size: 'M', quantity: 1 }]), /valid fit/);
  assert.throws(() => normalizeCart([{ productId: 'c1-yhwh-kids', fit: 'Boys', size: '3XL', quantity: 1 }]), /valid size/);
});
