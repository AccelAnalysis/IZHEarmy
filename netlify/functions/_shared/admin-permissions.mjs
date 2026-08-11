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
    description: 'Accountability reporting, append-only entry requests, payment review, and bounded exports.',
    permissions: [
      'overview.read',
      'accountability.read', 'accountability.write', 'accountability.export',
      'campaigns.read',
      'operations.orders.read',
      'operations.give_one.read'
    ]
  }),
  accountability_approver: Object.freeze({
    id: 'accountability_approver',
    label: 'Accountability Approver',
    description: 'Separate approval authority for financial and accountability actions.',
    permissions: ['overview.read', 'accountability.read', 'accountability.approve']
  }),
  accountability_period_manager: Object.freeze({
    id: 'accountability_period_manager',
    label: 'Accountability Period Manager',
    description: 'Separate authority to lock or unlock accountability reporting periods.',
    permissions: ['overview.read', 'accountability.read', 'accountability.lock_period']
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

const read = (permission, auditAction, extra = {}) => ({
  methods: ['GET'], permission, csrf: false, recentAuth: false, auditAction, rateClass: 'read', ...extra
});
const write = (permission, auditAction, extra = {}) => ({
  methods: ['POST'], permission, csrf: true, recentAuth: false, auditAction, rateClass: 'write',
  contentTypes: ['application/json'], maxBodyBytes: 1_000_000, ...extra
});
const upload = (permission, auditAction, extra = {}) => ({
  methods: ['POST'], permission, csrf: true, recentAuth: false, auditAction, rateClass: 'upload',
  contentTypes: ['multipart/form-data'], maxBodyBytes: 6 * 1024 * 1024, ...extra
});
const exportPolicy = (permission, auditAction) => ({
  methods: ['POST'], permission, csrf: true, recentAuth: true, auditAction, rateClass: 'export',
  contentTypes: ['application/json'], maxBodyBytes: 100_000
});

/**
 * Canonical inventory for authenticated administrative Netlify Functions.
 * Multi-mode endpoints declare their lowest entry permission here and enforce
 * stronger action-specific permissions in their own adminEndpoint handlers.
 */
export const ADMIN_ENDPOINT_POLICIES = Object.freeze({
  'admin-accountability-approvals': read('accountability.read', 'accountability.approvals.read'),
  'admin-accountability-periods': read('accountability.read', 'accountability.periods.read'),
  'admin-allocate-refund': write('accountability.read', 'refund_allocation.route', { maxBodyBytes: 250_000 }),
  'admin-audit': read('administration.audit.read', 'audit.read'),
  'admin-audit-export': exportPolicy('administration.audit.read', 'audit.export'),
  'admin-audit-verify': read('administration.audit.read', 'audit.verify'),
  'admin-build-church-batch': write('operations.batches.write', 'church_batch.build', { rateClass: 'bulk', maxBodyBytes: 100_000 }),
  'admin-campaign-data': read('campaigns.read', 'campaign.read'),
  'admin-campaign-report': exportPolicy('campaigns.export', 'campaign_report.export'),
  'admin-catalog': read('catalog.products.read', 'catalog.read'),
  'admin-content-data': read('content.website.read', 'website_content.read'),
  'admin-create-codes': write('operations.give_one.write', 'give_one.codes.create', { recentAuth: true, rateClass: 'bulk', maxBodyBytes: 100_000 }),
  'admin-data': read('operations.orders.read', 'operations.read'),
  'admin-detail': read('overview.read', 'admin_detail.read'),
  'admin-duplicate-product': write('catalog.products.duplicate', 'product.duplicate', { maxBodyBytes: 100_000 }),
  'admin-export': exportPolicy('overview.read', 'operations.export'),
  'admin-finance-data': read('accountability.read', 'accountability.read'),
  'admin-finance-export': exportPolicy('accountability.export', 'accountability.export'),
  'admin-financial-actions': read('accountability.read', 'financial_actions.read'),
  'admin-invite-user': write('administration.users.manage', 'administrator.invite', { recentAuth: true, maxBodyBytes: 100_000 }),
  'admin-list': read('overview.read', 'admin_list.read'),
  'admin-logout': write('overview.read', 'session.logout', { maxBodyBytes: 10_000 }),
  'admin-overview': read('overview.read', 'overview.read'),
  'admin-payment-migration-report': read('accountability.read', 'payment_migration.read'),
  'admin-pickup-order': write('operations.pickup.write', 'pickup.order.update', { maxBodyBytes: 100_000 }),
  'admin-pickup-roster': exportPolicy('operations.pickup.export', 'pickup_roster.export'),
  'admin-reconcile-payment': write('accountability.read', 'payment_reconciliation.route', { maxBodyBytes: 100_000 }),
  'admin-reject-financial-action': write('accountability.approve', 'financial_action.reject', { recentAuth: true, maxBodyBytes: 100_000 }),
  'admin-review-accountability': write('accountability.approve', 'accountability.review', { recentAuth: true, maxBodyBytes: 100_000 }),
  'admin-revoke-session': write('overview.read', 'session.revoke', { recentAuth: true, maxBodyBytes: 100_000 }),
  'admin-save-batch': write('operations.batches.write', 'batch.save'),
  'admin-save-campaign': write('campaigns.write', 'campaign.save'),
  'admin-save-collection': write('catalog.collections.write', 'collection.save', { maxBodyBytes: 500_000 }),
  'admin-save-content': write('content.website.write', 'website_content.save'),
  'admin-save-ledger-entry': write('accountability.write', 'accountability.request', { recentAuth: true, maxBodyBytes: 250_000 }),
  'admin-save-product': write('catalog.products.write', 'product.save'),
  'admin-save-teaching': write('content.teaching.write', 'teaching.save'),
  'admin-sessions': read('overview.read', 'sessions.read'),
  'admin-step-up': read('overview.read', 'session.step_up'),
  'admin-teaching-data': read('content.teaching.read', 'teaching.read'),
  'admin-update-accountability-period': write('accountability.lock_period', 'accountability.period.update', { recentAuth: true, maxBodyBytes: 100_000 }),
  'admin-update-code': write('operations.give_one.write', 'give_one.code.update', { maxBodyBytes: 100_000 }),
  'admin-update-inquiry': write('campaigns.write', 'campaign_inquiry.update', { maxBodyBytes: 250_000 }),
  'admin-update-media': write('media.manage', 'media.update', { maxBodyBytes: 250_000 }),
  'admin-update-order': write('operations.orders.write', 'order.update', { maxBodyBytes: 250_000 }),
  'admin-update-redemption': write('operations.give_one.write', 'give_one.redemption.update', { maxBodyBytes: 250_000 }),
  'admin-update-user': write('administration.roles.manage', 'administrator.update', { recentAuth: true, maxBodyBytes: 100_000 }),
  'admin-upload-media': upload('media.upload', 'media.upload'),
  'admin-upload-teaching-file': upload('content.teaching.write', 'teaching_file.upload'),
  'admin-users': read('administration.users.read', 'administrator.list'),
  'admin-visual-editor': read('content.website.preview', 'visual_editor.route')
});

/** OIDC/session bootstrap routes cannot require an existing session. */
export const ADMIN_AUTH_ENDPOINTS = Object.freeze([
  'admin-login',
  'admin-oidc-callback',
  'admin-session'
]);

/** Public routes that conditionally reveal drafts or restricted files. */
export const PUBLIC_ADMIN_AWARE_ENDPOINTS = Object.freeze({
  'media': 'media.read',
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
