import { getStore } from '@netlify/blobs';
import { DEFAULT_CONTENT_LIBRARY } from './content-defaults.mjs';
import { CONTENT_SCHEMAS, publicContent, validateContentRecord } from './content-rules.mjs';

const STORE = 'izhe-content';
const KEY = 'library';
const clone = (value) => structuredClone(value);

export { CONTENT_SCHEMAS, publicContent, validateContentRecord };

function validateLibrary(input) {
  const records = [];
  const seen = new Set();
  for (const raw of input?.records || []) {
    if (seen.has(raw.key)) throw new Error(`Duplicate content key: ${raw.key}`);
    const existing = raw.createdAt ? { ...raw, revision: Number(raw.revision || 1) - 1 } : null;
    const clean = validateContentRecord(raw, existing);
    clean.revision = Number(raw.revision || clean.revision || 1);
    clean.createdAt = raw.createdAt || clean.createdAt;
    clean.updatedAt = raw.updatedAt || clean.updatedAt;
    records.push(clean);
    seen.add(clean.key);
  }
  return { schemaVersion: 1, revision: Number(input?.revision || 1), updatedAt: input?.updatedAt || new Date().toISOString(), records };
}

export async function loadContentLibrary() {
  const store = getStore(STORE);
  const entry = await store.getWithMetadata(KEY, { type: 'json', consistency: 'strong' });
  if (entry?.data) return { library: validateLibrary(entry.data), etag: entry.etag };
  const seeded = validateLibrary(clone(DEFAULT_CONTENT_LIBRARY));
  const created = await store.setJSON(KEY, seeded, { onlyIfNew: true });
  if (created.modified) return { library: seeded, etag: created.etag };
  const raced = await store.getWithMetadata(KEY, { type: 'json', consistency: 'strong' });
  return { library: validateLibrary(raced?.data || seeded), etag: raced?.etag || null };
}

export async function saveContentRecord(input, expectedRevision = null) {
  const { library, etag } = await loadContentLibrary();
  if (expectedRevision != null && Number(expectedRevision) !== library.revision) {
    throw Object.assign(new Error('Website content changed in another session. Reload before saving.'), { statusCode: 409 });
  }
  const existing = library.records.find((record) => record.key === input?.key) || null;
  const record = validateContentRecord(input, existing);
  const records = existing
    ? library.records.map((item) => item.key === record.key ? record : item)
    : [...library.records, record];
  const next = { ...library, revision: library.revision + 1, updatedAt: new Date().toISOString(), records };
  const result = await getStore(STORE).setJSON(KEY, next, { onlyIfMatch: etag });
  if (!result.modified) throw Object.assign(new Error('Website content changed in another session. Reload before saving.'), { statusCode: 409 });
  return { library: next, record, etag: result.etag };
}
