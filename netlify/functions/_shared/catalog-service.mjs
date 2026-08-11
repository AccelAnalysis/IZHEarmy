import { getStore } from '@netlify/blobs';
import { DEFAULT_CATALOG } from './catalog-defaults.mjs';
import { applyCatalogMigrations } from './catalog-migrations.mjs';
import { validateCatalog } from './catalog-rules.mjs';

export * from './catalog-rules.mjs';

const STORE_NAME = 'izhe-catalog';
const CATALOG_KEY = 'catalog';
const clone = (value) => structuredClone(value);

async function migrateStoredCatalog(store, entry, attemptsRemaining = 2) {
  const current = validateCatalog(entry.data);
  const migration = applyCatalogMigrations(current);
  if (migration.conflicts.length) {
    console.error('catalog-migration-conflicts', migration.conflicts);
    return { catalog: current, etag: entry.etag };
  }
  if (!migration.changed) return { catalog: current, etag: entry.etag };

  const clean = validateCatalog({
    ...migration.catalog,
    revision: Number(current.revision || 0) + 1,
    updatedAt: new Date().toISOString()
  });
  const result = entry.etag
    ? await store.setJSON(CATALOG_KEY, clean, { onlyIfMatch: entry.etag })
    : await store.setJSON(CATALOG_KEY, clean, { onlyIfNew: true });
  if (result.modified) return { catalog: clean, etag: result.etag };

  const latest = await store.getWithMetadata(CATALOG_KEY, { type: 'json', consistency: 'strong' });
  if (!latest?.data) throw Object.assign(new Error('The catalog changed while applying its data migration.'), { statusCode: 409 });
  if (attemptsRemaining <= 0) return { catalog: validateCatalog(latest.data), etag: latest.etag };
  return migrateStoredCatalog(store, latest, attemptsRemaining - 1);
}

export async function loadCatalog({ seed = true } = {}) {
  const store = getStore(STORE_NAME);
  const entry = await store.getWithMetadata(CATALOG_KEY, { type: 'json', consistency: 'strong' });
  if (entry?.data) return migrateStoredCatalog(store, entry);
  const fallback = validateCatalog(clone(DEFAULT_CATALOG));
  if (!seed) return { catalog: fallback, etag: null };
  const created = await store.setJSON(CATALOG_KEY, fallback, { onlyIfNew: true });
  if (created.modified) return { catalog: fallback, etag: created.etag };
  const raced = await store.getWithMetadata(CATALOG_KEY, { type: 'json', consistency: 'strong' });
  if (raced?.data) return migrateStoredCatalog(store, raced);
  return { catalog: fallback, etag: null };
}

export async function saveCatalog(nextCatalog, etag) {
  const migration = applyCatalogMigrations(nextCatalog);
  if (migration.conflicts.length) {
    throw Object.assign(new Error('A catalog migration conflicts with existing product IDs or Stripe lookup keys.'), { statusCode: 409 });
  }
  const clean = validateCatalog({
    ...migration.catalog,
    revision: Number(nextCatalog.revision || 0) + 1,
    updatedAt: new Date().toISOString()
  });
  const store = getStore(STORE_NAME);
  const result = etag
    ? await store.setJSON(CATALOG_KEY, clean, { onlyIfMatch: etag })
    : await store.setJSON(CATALOG_KEY, clean, { onlyIfNew: true });
  if (!result.modified) throw Object.assign(new Error('The catalog changed in another session. Reload before saving again.'), { statusCode: 409 });
  return { catalog: clean, etag: result.etag };
}
