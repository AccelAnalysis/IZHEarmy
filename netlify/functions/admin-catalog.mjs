import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import { hasPermission } from './_shared/admin-permissions.mjs';
import { loadCatalog, publicCatalog } from './_shared/catalog-service.mjs';
import { json } from './_shared/http.mjs';
import { listMedia } from './_shared/media-service.mjs';

export default adminEndpoint({
  methods: ['GET'],
  permission: 'catalog.products.read',
  csrf: false,
  recentAuth: false,
  auditAction: 'catalog.read',
  rateClass: 'read'
}, async (_request, context) => {
  const { catalog, etag } = await loadCatalog();
  const canReadCollections = hasPermission(context.permissions, 'catalog.collections.read');
  const canReadMedia = hasPermission(context.permissions, 'media.read');
  const projectedCatalog = {
    ...catalog,
    collections: canReadCollections ? catalog.collections : []
  };
  const media = canReadMedia ? await listMedia() : [];
  return json({
    catalog: projectedCatalog,
    preview: publicCatalog(projectedCatalog, { includeDrafts: true }),
    etag,
    media,
    permissionsApplied: { collections: canReadCollections, media: canReadMedia }
  });
});
