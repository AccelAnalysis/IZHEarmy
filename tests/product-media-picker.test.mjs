import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const productSource = fs.readFileSync(new URL('../public/assets/admin-v2/pages/products.js', import.meta.url), 'utf8');
const pickerSource = fs.readFileSync(new URL('../public/assets/admin-v2/ui/media-picker.js', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../public/assets/admin-v2/app.js', import.meta.url), 'utf8');

test('product editor uses the shared Admin v2 Media Library picker', () => {
  assert.match(appSource, /renderProducts/);
  assert.match(productSource, /mediaPickerButton/);
  assert.match(productSource, /Choose from Media Library|mediaPickerButton/);
  assert.match(pickerSource, /const ACTION_LABEL = 'Choose from Media Library'/);
  assert.match(pickerSource, /openMediaPicker/);
  assert.match(pickerSource, /Media Library/);
  assert.doesNotMatch(productSource, /SELECT FROM MEDIA|Choose approved site media/i);
});

test('shared Media Library picker preserves safe selection and eligibility behavior', () => {
  assert.match(pickerSource, /usageStatus === 'approved_for_site_use'/);
  assert.match(pickerSource, /rightsStatus === 'cleared'/);
  assert.match(pickerSource, /Alt text:/);
  assert.match(pickerSource, /aria-selected/);
  assert.match(pickerSource, /Clear Selection/);
  assert.match(pickerSource, /Use Selected Media/);
  assert.match(pickerSource, /This asset is not eligible in the current context/);
  assert.match(productSource, /url: media\.thumbnailUrl/);
  assert.match(productSource, /alt: media\.altText/);
  assert.match(productSource, /productAccuracyStatus === 'confirmed'/);
});
