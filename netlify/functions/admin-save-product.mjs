import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import { hasPermission } from './_shared/admin-permissions.mjs';
import { readJsonBody } from './_shared/admin-request.mjs';
import { loadCatalog, saveCatalog, validateProduct } from './_shared/catalog-service.mjs';
import { json } from './_shared/http.mjs';

function requiresPublishPermission(existing, next) {
  if (!existing) return next.status === 'published';
  return existing.status !== next.status && (existing.status === 'published' || next.status === 'published' || next.status === 'archived');
}

export default adminEndpoint({
  methods: ['POST'],
  permission: 'catalog.products.write',
  csrf: true,
  recentAuth: false,
  auditAction: 'product.save',
  rateClass: 'write',
  contentTypes: ['application/json'],
  maxBodyBytes: 1_000_000
}, async (request, context) => {
  const payload = await readJsonBody(request);
  const { catalog, etag } = await loadCatalog();
  if (payload.expectedRevision != null && Number(payload.expectedRevision) !== catalog.revision) {
    throw Object.assign(new Error('The catalog changed in another session. Reload before saving.'), { statusCode: 409 });
  }
  const record = validateProduct(payload.product, catalog.collections);
  const originalId = String(payload.originalId || '').trim();
  if (originalId && originalId !== record.id) {
    throw Object.assign(new Error('Product IDs cannot be changed after creation.'), { statusCode: 409 });
  }
  const existing = catalog.products.find((product) => product.id === record.id) || null;
  if (requiresPublishPermission(existing, record) && !hasPermission(context.permissions, 'catalog.products.publish')) {
    throw Object.assign(new Error('Publishing, unpublishing, or archiving a product requires publishing permission.'), { statusCode: 403 });
  }
  if (catalog.products.some((product) => product.id !== record.id && product.lookupKey === record.lookupKey)) {
    throw Object.assign(new Error('Another product already uses this Stripe lookup key.'), { statusCode: 409 });
  }
  const products = existing
    ? catalog.products.map((product) => product.id === record.id ? { ...record, createdAt: product.createdAt } : product)
    : [...catalog.products, record];
  const saved = await saveCatalog({ ...catalog, products }, etag);
  const product = saved.catalog.products.find((item) => item.id === record.id);
  return {
    response: json({ product, catalogRevision: saved.catalog.revision, etag: saved.etag }),
    audit: {
      resourceType: 'product',
      resourceId: product.id,
      beforeSummary: existing,
      afterSummary: product
    }
  };
});
