import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import { hasPermission } from './_shared/admin-permissions.mjs';
import { readJsonBody } from './_shared/admin-request.mjs';
import { loadContentLibrary, saveContentRecord } from './_shared/content-service.mjs';
import { json } from './_shared/http.mjs';

function requiresPublishPermission(existing, next) {
  if (!existing) return next?.status === 'published';
  return existing.status !== next?.status && (existing.status === 'published' || next?.status === 'published' || next?.status === 'archived');
}

export default adminEndpoint({
  methods: ['POST'],
  permission: 'content.website.write',
  csrf: true,
  recentAuth: false,
  auditAction: 'website_content.save',
  rateClass: 'write',
  contentTypes: ['application/json'],
  maxBodyBytes: 1_000_000
}, async (request, context) => {
  const payload = await readJsonBody(request);
  const current = await loadContentLibrary();
  const existing = current.library.records.find((record) => record.key === payload.record?.key) || null;
  if (requiresPublishPermission(existing, payload.record) && !hasPermission(context.permissions, 'content.website.publish')) {
    throw Object.assign(new Error('Publishing, unpublishing, or archiving website content requires publishing permission.'), { statusCode: 403 });
  }
  const result = await saveContentRecord(payload.record, payload.expectedRevision);
  return {
    response: json(result),
    audit: {
      resourceType: 'website_content',
      resourceId: result.record.key,
      beforeSummary: existing,
      afterSummary: result.record
    }
  };
});
