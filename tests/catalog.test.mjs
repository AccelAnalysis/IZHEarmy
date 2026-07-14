import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCart, cartTotal } from '../netlify/functions/_shared/catalog.mjs';
import { createGiveCode, normalizeCode } from '../netlify/functions/_shared/codes.mjs';

test('normalizes and merges matching cart rows', () => {
  const cart = normalizeCart([
    { productId: 'core', size: 'm', quantity: 1 },
    { productId: 'core', size: 'M', quantity: 2 }
  ]);
  assert.deepEqual(cart, [{ productId: 'core', size: 'M', quantity: 3 }]);
  assert.equal(cartTotal(cart), 10500);
});

test('rejects invalid size', () => {
  assert.throws(() => normalizeCart([{ productId: 'core', size: '4XL', quantity: 1 }]), /valid size/);
});

test('creates valid Give One code', () => {
  const code = createGiveCode();
  assert.match(code, /^IZHE-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  assert.equal(normalizeCode(code.toLowerCase()), code);
});
