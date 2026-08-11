import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import { hasPermission } from './_shared/admin-permissions.mjs';
import { readJsonBody } from './_shared/admin-request.mjs';
import { loadCatalog } from './_shared/catalog-service.mjs';
import { listCampaigns } from './_shared/campaign-service.mjs';
import { loadTeachingLibrary, saveTeachingRecord } from './_shared/teaching-service.mjs';
import { json } from './_shared/http.mjs';

const PUBLISH_STATES = new Set(['scheduled', 'published', 'hidden', 'archived']);
function existingRecord(library, type, id) {
  const key = type === 'book' ? 'books' : type === 'chapter' ? 'chapters' : 'resources';
  return (library[key] || []).find((item) => item.id === id) || null;
}
function requiresPublishPermission(existing, next) {
  if (!existing) return PUBLISH_STATES.has(next?.status);
  return existing.status !== next?.status && (PUBLISH_STATES.has(existing.status) || PUBLISH_STATES.has(next?.status));
}

export default adminEndpoint({
  methods: ['POST'],
  permission: 'content.teaching.write',
  csrf: true,
  recentAuth: false,
  auditAction: 'teaching.save',
  rateClass: 'write',
  contentTypes: ['application/json'],
  maxBodyBytes: 1_000_000
}, async (request, context) => {
  const payload = await readJsonBody(request);
  const current = await loadTeachingLibrary();
  const existing = existingRecord(current.library, payload.type, payload.record?.id);
  if (requiresPublishPermission(existing, payload.record) && !hasPermission(context.permissions, 'content.teaching.publish')) {
    throw Object.assign(new Error('Scheduling, publishing, unpublishing, or archiving teaching content requires publishing permission.'), { statusCode: 403 });
  }
  const [{ catalog }, campaigns] = await Promise.all([loadCatalog(), listCampaigns()]);
  const result = await saveTeachingRecord(payload.type, payload.record, payload.expectedRevision, { products: catalog.products, campaigns });
  return {
    response: json(result),
    audit: {
      resourceType: `teaching_${payload.type}`,
      resourceId: result.record.id,
      beforeSummary: existing,
      afterSummary: result.record
    }
  };
});
