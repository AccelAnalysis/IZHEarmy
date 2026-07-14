import { getStore } from '@netlify/blobs';
import { DEFAULT_CATALOG } from './catalog-defaults.mjs';
import { validateCatalog } from './catalog-rules.mjs';

export * from './catalog-rules.mjs';

const STORE_NAME = 'izhe-catalog';
const CATALOG_KEY = 'catalog';
const clone = (value) => structuredClone(value);

export async function loadCatalog({ seed = true } = {}) {
  const store = getStore(STORE_NAME);
  const entry = await store.getWithMetadata(CATALOG_KEY, { type: 'json', consistency: 'strong' });
  if (entry?.data) return { catalog: validateCatalog(entry.data), etag: entry.etag };
  const fallback = validateCatalog(clone(DEFAULT_CATALOG));
  if (!seed) return { catalog: fallback, etag: null };
  const created = await store.setJSON(CATALOG_KEY, fallback, { onlyIfNew: true });
  if (created.modified) return { catalog: fallback, etag: created.etag };
  const raced = await store.getWithMetadata(CATALOG_KEY, { type: 'json', consistency: 'strong' });
  return { catalog: validateCatalog(raced?.data || fallback), etag: raced?.etag || null };
}

export async function saveCatalog(nextCatalog, etag) {
  const store = getStore(STORE_NAME);
  const clean = validateCatalog({
    ...nextCatalog,
    revision: Number(nextCatalog.revision || 0) + 1,
    updatedAt: new Date().toISOString()
  });
  const result = etag
    ? await store.setJSON(CATALOG_KEY, clean, { onlyIfMatch: etag })
    : await store.setJSON(CATALOG_KEY, clean, { onlyIfNew: true });
  if (!result.modified) throw Object.assign(new Error('The catalog changed in another session. Reload before saving again.'), { statusCode: 409 });
  return { catalog: clean, etag: result.etag };
}
