import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import { hasPermission } from './_shared/admin-permissions.mjs';
import { text } from './_shared/admin-request.mjs';
import { getAdministrativeResourceDetail, resourceDefinition } from './_shared/admin-resource-service.mjs';
import { json } from './_shared/http.mjs';

export default adminEndpoint({
  methods: ['GET'],
  permission: 'overview.read',
  csrf: false,
  recentAuth: false,
  auditAction: 'admin_detail.read',
  rateClass: 'read'
}, async (request, context) => {
  const url = new URL(request.url);
  const resource = text(url.searchParams.get('resource'), 80);
  const id = text(url.searchParams.get('id'), 240);
  const definition = resourceDefinition(resource);
  if (!definition) throw Object.assign(new Error('Unknown administrative resource.'), { statusCode: 404 });
  if (!id) throw Object.assign(new Error('A record ID is required.'), { statusCode: 400 });
  if (!hasPermission(context.permissions, definition.permission)) {
    throw Object.assign(new Error('You do not have permission to reveal this administrative record.'), { statusCode: 403 });
  }
  const result = await getAdministrativeResourceDetail(resource, id);
  return {
    response: json({ resource, ...result }),
    audit: {
      resourceType: resource,
      resourceId: id,
      afterSummary: { sensitiveDetailRevealed: true }
    }
  };
});
