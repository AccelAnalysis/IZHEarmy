import { requireAdmin } from './_shared/admin-auth.mjs';
import { loadCatalog, saveCatalog, validateProduct } from './_shared/catalog-service.mjs';
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
    const record = validateProduct(payload.product, catalog.collections);
    const originalId = String(payload.originalId || '').trim();
    if (originalId && originalId !== record.id) return json({ error: 'Product IDs cannot be changed after creation.' }, 409);
    const existing = catalog.products.find((product) => product.id === record.id);
    if (catalog.products.some((product) => product.id !== record.id && product.lookupKey === record.lookupKey)) {
      return json({ error: 'Another product already uses this Stripe lookup key.' }, 409);
    }
    const products = existing
      ? catalog.products.map((product) => product.id === record.id ? { ...record, createdAt: product.createdAt } : product)
      : [...catalog.products, record];
    const saved = await saveCatalog({ ...catalog, products }, etag);
    return json({ product: saved.catalog.products.find((product) => product.id === record.id), catalog: saved.catalog, etag: saved.etag });
  } catch (error) {
    console.error('admin-save-product', error);
    return json({ error: error.message || 'The product could not be saved.' }, error.statusCode || 400);
  }
};
