import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import { hasPermission } from './_shared/admin-permissions.mjs';
import { readJsonBody } from './_shared/admin-request.mjs';
import { loadCatalog, saveCatalog, validateCollection } from './_shared/catalog-service.mjs';
import { json } from './_shared/http.mjs';

function requiresPublishPermission(existing, next) {
  if (!existing) return next.status === 'published';
  return existing.status !== next.status && (existing.status === 'published' || next.status === 'published' || next.status === 'archived');
}

export default adminEndpoint({
  methods: ['POST'],
  permission: 'catalog.collections.write',
  csrf: true,
  recentAuth: false,
  auditAction: 'collection.save',
  rateClass: 'write',
  contentTypes: ['application/json'],
  maxBodyBytes: 500_000
}, async (request, context) => {
  const payload = await readJsonBody(request);
  const { catalog, etag } = await loadCatalog();
  if (payload.expectedRevision != null && Number(payload.expectedRevision) !== catalog.revision) {
    throw Object.assign(new Error('The catalog changed in another session. Reload before saving.'), { statusCode: 409 });
  }
  const record = validateCollection(payload.collection);
  const originalId = String(payload.originalId || '').trim();
  if (originalId && originalId !== record.id) {
    throw Object.assign(new Error('Collection IDs cannot be changed after creation.'), { statusCode: 409 });
  }
  const existing = catalog.collections.find((collection) => collection.id === record.id) || null;
  if (requiresPublishPermission(existing, record) && !hasPermission(context.permissions, 'catalog.collections.publish')) {
    throw Object.assign(new Error('Publishing, unpublishing, or archiving a collection requires publishing permission.'), { statusCode: 403 });
  }
  if (catalog.collections.some((collection) => collection.id !== record.id && collection.slug === record.slug)) {
    throw Object.assign(new Error('Another collection already uses this URL slug.'), { statusCode: 409 });
  }
  const collections = existing
    ? catalog.collections.map((collection) => collection.id === record.id ? { ...record, createdAt: collection.createdAt } : collection)
    : [...catalog.collections, record];
  const saved = await saveCatalog({ ...catalog, collections }, etag);
  const collection = saved.catalog.collections.find((item) => item.id === record.id);
  return {
    response: json({ collection, catalogRevision: saved.catalog.revision, etag: saved.etag }),
    audit: {
      resourceType: 'collection',
      resourceId: collection.id,
      beforeSummary: existing,
      afterSummary: collection
    }
  };
});
