import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import { listAdminAuditEvents } from './_shared/admin-audit-service.mjs';
import { hasPermission } from './_shared/admin-permissions.mjs';
import { administrativeResourceCounts } from './_shared/admin-resource-service.mjs';
import { loadCatalog } from './_shared/catalog-service.mjs';
import { json } from './_shared/http.mjs';

export default adminEndpoint({
  methods: ['GET'],
  permission: 'overview.read',
  csrf: false,
  recentAuth: false,
  auditAction: 'overview.read',
  rateClass: 'read'
}, async (_request, context) => {
  const [counts, catalogResult] = await Promise.all([administrativeResourceCounts(), loadCatalog()]);
  const products = catalogResult.catalog.products || [];
  const alerts = [];
  const missingImages = products.filter((product) => !(product.images || []).length && !product.image && !product.imageUrl).length;
  const pausedPublished = products.filter((product) => product.status === 'published' && product.availability === 'paused').length;
  if (counts.pendingOrders) alerts.push({ id: 'pending-orders', severity: 'information', label: `${counts.pendingOrders} orders require operational attention.`, route: '/admin/operations/orders' });
  if (counts.openBatches) alerts.push({ id: 'open-batches', severity: 'information', label: `${counts.openBatches} production batches remain open.`, route: '/admin/operations/batches' });
  if (counts.pendingRedemptions) alerts.push({ id: 'pending-redemptions', severity: 'warning', label: `${counts.pendingRedemptions} Give One redemptions are not complete.`, route: '/admin/operations/give-one' });
  if (missingImages) alerts.push({ id: 'missing-product-images', severity: 'warning', label: `${missingImages} products have no assigned image.`, route: '/admin/catalog/products' });
  if (pausedPublished) alerts.push({ id: 'paused-published', severity: 'warning', label: `${pausedPublished} published products are paused.`, route: '/admin/catalog/products' });

  let recentActivity = [];
  if (hasPermission(context.permissions, 'administration.audit.read')) {
    const audit = await listAdminAuditEvents({ limit: 8 });
    recentActivity = audit.items.map((event) => ({
      eventId: event.eventId,
      timestamp: event.timestamp,
      actorDisplayName: event.actorDisplayName,
      action: event.action,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      result: event.result
    }));
  }

  return json({
    counts,
    alerts: alerts.slice(0, 8),
    recentActivity,
    catalogRevision: catalogResult.catalog.revision,
    generatedAt: new Date().toISOString()
  });
});
