import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('content-managed media suppresses fallback imagery only until the published asset resolves', async () => {
  const index = await read('public/index.html');

  assert.match(index, /images\.unsplash\.com/, 'stock imagery must remain available as a legitimate fallback');
  assert.match(index, /#top\.izhe-media-pending,#book\.izhe-media-pending,#church\.izhe-media-pending\{background-image:none!important\}/);
  assert.match(index, /#story img\.izhe-media-pending,#give-one img\.izhe-media-pending\{opacity:0!important\}/);
  assert.match(index, /id="top"[^>]*izhe-media-pending/);
  assert.match(index, /id="story"[\s\S]*?<img[^>]*izhe-media-pending/);
  assert.match(index, /id="book"[^>]*izhe-media-pending/);
  assert.match(index, /id="give-one"[\s\S]*?<img[^>]*izhe-media-pending/);
  assert.match(index, /id="church"[^>]*izhe-media-pending/);
});

test('structured content reveals the selected image instead of flashing its static fallback', async () => {
  const loader = await read('public/assets/site-content-load.js');

  assert.match(loader, /IZHE_revealForegroundWhenReady/);
  assert.match(loader, /IZHE_revealBackgroundWhenReady/);
  assert.match(loader, /window\.addEventListener\('izhe:catalog-ready',applyPublishedContent,\{once:true\}\)/);
  assert.match(loader, /element\.style\.backgroundImage='';reveal\(\)/, 'failed replacement backgrounds should fall back to the static stock treatment');
  assert.match(loader, /image\.src=fallbackSrc/, 'failed replacement foreground images should fall back to the static stock source');
});

test('catalog placeholders stay hidden until the live catalog has replaced them', async () => {
  const index = await read('public/index.html');
  const catalogBoot = await read('public/assets/app-part-5.js');

  assert.match(index, /#collection \.izhe-catalog-pending\{opacity:0;pointer-events:none\}/);
  assert.match(index, /class="max-w-7xl mx-auto px-6 izhe-catalog-pending"/);
  assert.match(catalogBoot, /classList\.remove\('izhe-catalog-pending'\)/);
  assert.match(catalogBoot, /new CustomEvent\('izhe:catalog-ready'/);
});
