export const ROUTES = Object.freeze([
  { path: '/admin/', id: 'overview', label: 'Overview', icon: 'overview', permission: 'overview.read', group: '' },

  { path: '/admin/catalog/products', id: 'products', label: 'Products', icon: 'products', permission: 'catalog.products.read', group: 'Catalog' },
  { path: '/admin/catalog/collections', id: 'collections', label: 'Collections', icon: 'collections', permission: 'catalog.collections.read', group: 'Catalog' },
  { path: '/admin/catalog/media', id: 'media', label: 'Media Library', icon: 'media', permission: 'media.read', group: 'Catalog' },

  { path: '/admin/content/website', id: 'website-content', label: 'Website Content', icon: 'content', permission: 'content.website.read', group: 'Content' },
  { path: '/admin/content/visual-editor', id: 'visual-editor', label: 'Visual Editor', icon: 'content', permission: 'content.website.preview', group: 'Content' },
  { path: '/admin/content/teaching', id: 'teaching', label: 'Teaching Library', icon: 'teaching', permission: 'content.teaching.read', group: 'Content' },

  { path: '/admin/operations/orders', id: 'orders', label: 'Orders', icon: 'orders', permission: 'operations.orders.read', group: 'Operations' },
  { path: '/admin/operations/give-one', id: 'give-one', label: 'Give One', icon: 'gift', permission: 'operations.give_one.read', group: 'Operations' },
  { path: '/admin/operations/fulfillment', id: 'fulfillment', label: 'Fulfillment', icon: 'fulfillment', permission: 'operations.fulfillment.read', group: 'Operations' },
  { path: '/admin/operations/production-batches', aliases: ['/admin/operations/batches'], id: 'batches', label: 'Production Batches', icon: 'batches', permission: 'operations.batches.read', group: 'Operations' },
  { path: '/admin/operations/church-pickup', aliases: ['/admin/operations/pickup'], id: 'pickup', label: 'Church Pickup', icon: 'pickup', permission: 'operations.pickup.read', group: 'Operations' },

  { path: '/admin/campaigns', id: 'campaigns', label: 'Campaigns', icon: 'campaigns', permission: 'campaigns.read', group: '' },
  { path: '/admin/accountability', id: 'accountability', label: 'Accountability', icon: 'accountability', permission: 'accountability.read', group: '' },

  { path: '/admin/administration/users', id: 'users', label: 'Administrators & Roles', icon: 'users', permission: 'administration.users.read', group: 'Administration' },
  { path: '/admin/administration/sessions', id: 'sessions', label: 'Active Sessions', icon: 'sessions', permission: 'overview.read', group: 'Administration' },
  { path: '/admin/administration/audit', id: 'audit', label: 'Audit Log', icon: 'audit', permission: 'administration.audit.read', group: 'Administration' }
]);

export function permissions(session) {
  return new Set(Array.isArray(session?.permissions) ? session.permissions : []);
}

export function can(session, permission) {
  return Boolean(permission && permissions(session).has(permission));
}

export function canAny(session, required = []) {
  const current = permissions(session);
  return required.some((permission) => current.has(permission));
}

export function routeForPath(pathname) {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return ROUTES.find((route) => {
    const routePath = route.path.length > 1 ? route.path.replace(/\/+$/, '') : route.path;
    return normalized === routePath || (route.aliases || []).some((alias) => normalized === alias.replace(/\/+$/, ''));
  }) || null;
}

export function visibleRoutes(session) {
  return ROUTES.filter((route) => can(session, route.permission));
}

export function groupedRoutes(session) {
  const groups = [];
  let currentGroup = Symbol('initial');
  for (const route of visibleRoutes(session)) {
    if (route.group !== currentGroup) {
      groups.push({ label: route.group, routes: [] });
      currentGroup = route.group;
    }
    groups.at(-1).routes.push(route);
  }
  return groups;
}

export function roleLabels(session) {
  const labels = Array.isArray(session?.roleSummary) ? session.roleSummary : [];
  return labels.length ? labels : Array.isArray(session?.roles) ? session.roles : [];
}

export function breadcrumbs(route) {
  if (!route) return ['Administration'];
  const values = ['Administration'];
  if (route.group) values.push(route.group);
  if (route.label !== route.group) values.push(route.label);
  return values;
}
