import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import { hasPermission } from './_shared/admin-permissions.mjs';
import { boundedInteger, text } from './_shared/admin-request.mjs';
import { listAdministrativeResource, resourceDefinition } from './_shared/admin-resource-service.mjs';
import { json } from './_shared/http.mjs';

export default adminEndpoint({
  methods: ['GET'],
  permission: 'overview.read',
  csrf: false,
  recentAuth: false,
  auditAction: 'admin_list.read',
  rateClass: 'read'
}, async (request, context) => {
  const url = new URL(request.url);
  const resource = text(url.searchParams.get('resource'), 80);
  const definition = resourceDefinition(resource);
  if (!definition) throw Object.assign(new Error('Unknown administrative resource.'), { statusCode: 404 });
  if (!hasPermission(context.permissions, definition.permission)) {
    throw Object.assign(new Error('You do not have permission to view this administrative resource.'), { statusCode: 403 });
  }
  const result = await listAdministrativeResource(resource, {
    search: text(url.searchParams.get('search'), 200),
    status: text(url.searchParams.get('status'), 100),
    dateFrom: text(url.searchParams.get('dateFrom'), 40),
    dateTo: text(url.searchParams.get('dateTo'), 40),
    campaignId: text(url.searchParams.get('campaignId'), 160),
    collectionId: text(url.searchParams.get('collectionId'), 160),
    fulfillmentMode: text(url.searchParams.get('fulfillmentMode'), 80),
    sort: text(url.searchParams.get('sort'), 80) || 'updated-desc',
    cursor: text(url.searchParams.get('cursor'), 500),
    limit: boundedInteger(url.searchParams.get('limit'), 25, { min: 1, max: 100 })
  });
  return {
    response: json({ resource, ...result }),
    audit: {
      resourceType: `${resource}_list`,
      resourceId: null,
      afterSummary: { returned: result.items.length, total: result.total, maskedProjection: true }
    }
  };
});
