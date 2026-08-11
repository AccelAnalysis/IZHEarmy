export const PERMISSIONS = Object.freeze([
  'overview.read',
  'catalog.collections.read',
  'catalog.collections.write',
  'catalog.collections.publish',
  'catalog.products.read',
  'catalog.products.write',
  'catalog.products.publish',
  'catalog.products.duplicate',
  'media.read',
  'media.upload',
  'media.manage',
  'content.website.read',
  'content.website.write',
  'content.website.publish',
  'content.website.preview',
  'content.teaching.read',
  'content.teaching.write',
  'content.teaching.publish',
  'content.teaching.preview',
  'operations.orders.read',
  'operations.orders.write',
  'operations.orders.export',
  'operations.give_one.read',
  'operations.give_one.write',
  'operations.give_one.export',
  'operations.fulfillment.read',
  'operations.fulfillment.write',
  'operations.batches.read',
  'operations.batches.write',
  'operations.pickup.read',
  'operations.pickup.write',
  'operations.pickup.export',
  'campaigns.read',
  'campaigns.write',
  'campaigns.publish',
  'campaigns.export',
  'accountability.read',
  'accountability.write',
  'accountability.approve',
  'accountability.export',
  'accountability.lock_period',
  'administration.users.read',
  'administration.users.manage',
  'administration.roles.manage',
  'administration.sessions.manage',
  'administration.audit.read'
]);

const ALL = [...PERMISSIONS];

export const ROLES = Object.freeze({
  owner: Object.freeze({
    id: 'owner',
    label: 'Owner',
    description: 'Full administrative authority, including access governance and emergency corrective action.',
    permissions: ALL
  }),
  operations_administrator: Object.freeze({
    id: 'operations_administrator',
    label: 'Operations Administrator',
    description: 'Orders, Give One, fulfillment, batches, church pickup, and bounded operational exports.',
    permissions: [
      'overview.read',
      'operations.orders.read', 'operations.orders.write', 'operations.orders.export',
      'operations.give_one.read', 'operations.give_one.write', 'operations.give_one.export',
      'operations.fulfillment.read', 'operations.fulfillment.write',
      'operations.batches.read', 'operations.batches.write',
      'operations.pickup.read', 'operations.pickup.write', 'operations.pickup.export',
      'campaigns.read'
    ]
  }),
  catalog_content_editor: Object.freeze({
    id: 'catalog_content_editor',
    label: 'Catalog and Content Editor',
    description: 'Draft catalog, media, website, and teaching work without live publishing authority by default.',
    permissions: [
      'overview.read',
      'catalog.collections.read', 'catalog.collections.write',
      'catalog.products.read', 'catalog.products.write', 'catalog.products.duplicate',
      'media.read', 'media.upload', 'media.manage',
      'content.website.read', 'content.website.write', 'content.website.preview',
      'content.teaching.read', 'content.teaching.write', 'content.teaching.preview'
    ]
  }),
  publisher: Object.freeze({
    id: 'publisher',
    label: 'Publisher',
    description: 'Review and publish catalog and content records without administrator-management authority.',
    permissions: [
      'overview.read',
      'catalog.collections.read', 'catalog.collections.publish',
      'catalog.products.read', 'catalog.products.publish',
      'media.read',
      'content.website.read', 'content.website.publish', 'content.website.preview',
      'content.teaching.read', 'content.teaching.publish', 'content.teaching.preview'
    ]
  }),
  campaign_administrator: Object.freeze({
    id: 'campaign_administrator',
    label: 'Campaign Administrator',
    description: 'Church inquiries, campaign configuration, campaign imagery, reporting, and campaign pickup context.',
    permissions: [
      'overview.read',
      'campaigns.read', 'campaigns.write', 'campaigns.publish', 'campaigns.export',
      'media.read', 'media.upload',
      'operations.pickup.read',
      'operations.batches.read'
    ]
  }),
  finance_accountability_administrator: Object.freeze({
    id: 'finance_accountability_administrator',
    label: 'Finance and Accountability Administrator',
    description: 'Accountability reporting, append-only ledger work, payment review, exports, and separately authorized locks.',
    permissions: [
      'overview.read',
      'accountability.read', 'accountability.write', 'accountability.export',
      'campaigns.read',
      'operations.orders.read',
      'operations.give_one.read'
    ]
  }),
  auditor: Object.freeze({
    id: 'auditor',
    label: 'Auditor / Read Only',
    description: 'Read-only operational, accountability, and administrative audit access.',
    permissions: [
      'overview.read',
      'catalog.collections.read', 'catalog.products.read', 'media.read',
      'content.website.read', 'content.teaching.read',
      'operations.orders.read', 'operations.give_one.read', 'operations.fulfillment.read',
      'operations.batches.read', 'operations.pickup.read',
      'campaigns.read', 'accountability.read',
      'administration.audit.read'
    ]
  })
});

export function validRoles(roles = []) {
  return [...new Set((Array.isArray(roles) ? roles : []).map(String).filter((role) => ROLES[role]))];
}

export function permissionsForRoles(roles = []) {
  const result = new Set();
  for (const role of validRoles(roles)) {
    for (const permission of ROLES[role].permissions) result.add(permission);
  }
  return [...result].sort();
}

export function hasPermission(userOrPermissions, permission) {
  if (!permission) return false;
  const permissions = Array.isArray(userOrPermissions)
    ? userOrPermissions
    : permissionsForRoles(userOrPermissions?.roles || []);
  return permissions.includes(permission);
}

export function roleSummary(roles = []) {
  return validRoles(roles).map((role) => ROLES[role].label);
}

const read = (permission, auditAction) => ({
  methods: ['GET'], permission, csrf: false, recentAuth: false, auditAction, rateClass: 'read'
});
const write = (permission, auditAction, extra = {}) => ({
  methods: ['POST'], permission, csrf: true, recentAuth: false, auditAction, rateClass: 'write',
  contentTypes: ['application/json'], maxBodyBytes: 1_000_000, ...extra
});
const upload = (permission, auditAction, extra = {}) => ({
  methods: ['POST'], permission, csrf: true, recentAuth: false, auditAction, rateClass: 'upload',
  contentTypes: ['multipart/form-data', 'application/json'], maxBodyBytes: 15_000_000, ...extra
});
const exportPolicy = (permission, auditAction) => ({
  methods: ['GET', 'POST'], permission, csrf: true, recentAuth: true, auditAction, rateClass: 'export',
  contentTypes: ['application/json'], maxBodyBytes: 100_000
});

/**
 * Every administrative Netlify Function must appear here. Public functions that
 * optionally reveal draft or restricted data pass an explicit permission to
 * `isAdmin()` and are covered separately by the endpoint-coverage test.
 */
export const ADMIN_ENDPOINT_POLICIES = Object.freeze({
  'admin-catalog': read('catalog.products.read', 'catalog.read'),
  'admin-data': read('operations.orders.read', 'operations.read'),
  'admin-content-data': read('content.website.read', 'website_content.read'),
  'admin-teaching-data': read('content.teaching.read', 'teaching.read'),
  'admin-campaign-data': read('campaigns.read', 'campaign.read'),
  'admin-finance-data': read('accountability.read', 'accountability.read'),
  'admin-payment-migration-report': read('accountability.read', 'payment_migration.read'),
  'admin-save-collection': write('catalog.collections.write', 'collection.save'),
  'admin-save-product': write('catalog.products.write', 'product.save'),
  'admin-duplicate-product': write('catalog.products.duplicate', 'product.duplicate'),
  'admin-save-content': write('content.website.write', 'website_content.save'),
  'admin-visual-editor': write('content.website.write', 'visual_editor.save'),
  'admin-save-teaching': write('content.teaching.write', 'teaching.save'),
  'admin-save-campaign': write('campaigns.write', 'campaign.save'),
  'admin-update-inquiry': write('campaigns.write', 'campaign_inquiry.update'),
  'admin-update-order': write('operations.orders.write', 'order.update'),
  'admin-create-codes': write('operations.give_one.write', 'give_one.codes.create', { recentAuth: true, rateClass: 'bulk' }),
  'admin-update-code': write('operations.give_one.write', 'give_one.code.update'),
  'admin-update-redemption': write('operations.give_one.write', 'give_one.redemption.update'),
  'admin-save-batch': write('operations.batches.write', 'batch.save'),
  'admin-build-church-batch': write('operations.batches.write', 'church_batch.build', { rateClass: 'bulk' }),
  'admin-pickup-order': write('operations.pickup.write', 'pickup.order.update'),
  'admin-update-media': write('media.manage', 'media.update'),
  'admin-upload-media': upload('media.upload', 'media.upload'),
  'admin-upload-teaching-file': upload('content.teaching.write', 'teaching_file.upload'),
  'admin-save-ledger-entry': write('accountability.write', 'ledger.entry.create', { recentAuth: true }),
  'admin-reconcile-payment': write('accountability.write', 'payment.reconcile', { recentAuth: true }),
  'admin-allocate-refund': write('accountability.write', 'refund.allocate', { recentAuth: true }),
  'admin-export': exportPolicy('operations.give_one.export', 'redemptions.export'),
  'admin-pickup-roster': exportPolicy('operations.pickup.export', 'pickup_roster.export'),
  'admin-campaign-report': exportPolicy('campaigns.export', 'campaign_report.export'),
  'admin-finance-export': exportPolicy('accountability.export', 'accountability.export'),
  'admin-overview': read('overview.read', 'overview.read'),
  'admin-list': read('overview.read', 'admin_list.read'),
  'admin-detail': read('overview.read', 'admin_detail.read'),
  'admin-session': read('overview.read', 'session.read'),
  'admin-logout': write('overview.read', 'session.logout'),
  'admin-users': { methods: ['GET', 'POST'], permission: 'administration.users.read', csrf: true, recentAuth: false, auditAction: 'administrator.manage', rateClass: 'write', contentTypes: ['application/json'], maxBodyBytes: 100_000 },
  'admin-sessions': read('administration.sessions.manage', 'sessions.read'),
  'admin-revoke-session': write('administration.sessions.manage', 'session.revoke', { recentAuth: true }),
  'admin-audit': read('administration.audit.read', 'audit.read'),
  'admin-audit-verify': read('administration.audit.read', 'audit.verify')
});

export const PUBLIC_ADMIN_AWARE_ENDPOINTS = Object.freeze({
  'public-catalog': 'catalog.products.read',
  'public-content': 'content.website.preview',
  'public-teaching': 'content.teaching.preview',
  'resource-file': 'content.teaching.preview'
});

export function endpointName(requestOrUrl) {
  const url = requestOrUrl instanceof URL
    ? requestOrUrl
    : new URL(typeof requestOrUrl === 'string' ? requestOrUrl : requestOrUrl.url);
  return url.pathname.split('/').filter(Boolean).at(-1)?.replace(/\.mjs$/i, '') || '';
}

export function endpointPolicy(requestOrName) {
  const name = typeof requestOrName === 'string' && !requestOrName.includes('/')
    ? requestOrName
    : endpointName(requestOrName);
  return ADMIN_ENDPOINT_POLICIES[name] || null;
}

export function assertKnownPermission(permission) {
  if (!PERMISSIONS.includes(permission)) throw new Error(`Unknown administrative permission: ${permission}`);
  return permission;
}
