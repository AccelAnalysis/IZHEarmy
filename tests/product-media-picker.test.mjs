import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../public/assets/admin-product-media-picker.js', import.meta.url), 'utf8');
const loader = fs.readFileSync(new URL('../public/assets/admin.js', import.meta.url), 'utf8');

test('product editor exposes the existing Media Library picker', () => {
  assert.doesNotThrow(() => new Function(source));
  assert.match(loader, /admin-product-media-picker\.js/);
  assert.match(source, /SELECT FROM MEDIA/);
  assert.match(source, /openGlobalMediaPicker/);
  assert.match(source, /title: 'Select product image'/);
});

test('selected media is attached safely to the current product', () => {
  assert.match(source, /image\.id === media\.id \|\| image\.url === media\.url/);
  assert.match(source, /media\.alt \|\| media\.title \|\| media\.filename/);
  assert.match(source, /image\.role === 'primary'/);
  assert.match(source, /role = .*\? 'gallery' : 'primary'/s);
  assert.match(source, /renderImages\(\)/);
  assert.match(source, /Save the product to keep the change/);
});
