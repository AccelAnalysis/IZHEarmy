import { requireAdmin } from './_shared/admin-auth.mjs';
import { loadCatalog, saveCatalog, validateCollection } from './_shared/catalog-service.mjs';
import { json, methodNotAllowed } from './_shared/http.mjs';

export default async (request) => {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const payload = await request.json();
    const { catalog, etag } = await loadCatalog();
    if (payload.expectedRevision != null && Number(payload.expectedRevision) !== catalog.revision) {
      return json({ error: 'The catalog changed in another session. Reload before saving.' }, 409);
    }
    const record = validateCollection(payload.collection);
    const originalId = String(payload.originalId || '').trim();
    if (originalId && originalId !== record.id) return json({ error: 'Collection IDs cannot be changed after creation.' }, 409);
    const existing = catalog.collections.find((collection) => collection.id === record.id);
    if (catalog.collections.some((collection) => collection.id !== record.id && collection.slug === record.slug)) {
      return json({ error: 'Another collection already uses this URL slug.' }, 409);
    }
    const collections = existing
      ? catalog.collections.map((collection) => collection.id === record.id ? { ...record, createdAt: collection.createdAt } : collection)
      : [...catalog.collections, record];
    const saved = await saveCatalog({ ...catalog, collections }, etag);
    return json({ collection: saved.catalog.collections.find((collection) => collection.id === record.id), catalog: saved.catalog, etag: saved.etag });
  } catch (error) {
    console.error('admin-save-collection', error);
    return json({ error: error.message || 'The collection could not be saved.' }, error.statusCode || 400);
  }
};
