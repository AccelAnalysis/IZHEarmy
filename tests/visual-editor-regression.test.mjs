import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONTENT_LIBRARY } from '../netlify/functions/_shared/content-defaults.mjs';
import { normalizeLegacyContentRecord } from '../netlify/functions/_shared/content-service.mjs';
import { validateContentRecord } from '../netlify/functions/_shared/content-rules.mjs';

test('optional empty announcement is hidden and remains valid', () => {
  const seeded = DEFAULT_CONTENT_LIBRARY.records.find((record) => record.key === 'site-announcement');
  assert.equal(seeded.status, 'hidden');
  assert.doesNotThrow(() => validateContentRecord(seeded));
});

test('legacy empty published announcement is migrated to hidden', () => {
  const fallback = DEFAULT_CONTENT_LIBRARY.records.find((record) => record.key === 'site-announcement');
  const legacy = { ...fallback, status: 'published', fields: { message: '', linkLabel: '', linkUrl: '' } };
  const normalized = normalizeLegacyContentRecord(legacy, fallback);
  assert.equal(normalized.status, 'hidden');
  assert.doesNotThrow(() => validateContentRecord(normalized));
});

test('other empty published content remains rejected', () => {
  assert.throws(
    () => validateContentRecord({ key: 'home-hero', status: 'published', fields: {} }),
    /Published content cannot be empty/
  );
});
