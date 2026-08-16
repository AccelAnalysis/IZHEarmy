import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { PERMISSIONS } from '../../netlify/functions/_shared/admin-permissions.mjs';

const evidenceDir = path.resolve('test-results', 'evidence');
fs.mkdirSync(evidenceDir, { recursive: true });

const session = {
  configured: true,
  authenticated: true,
  user: { id: 'admin_fixture_owner', email: 'owner@example.test', displayName: 'Fixture Owner' },
  userId: 'admin_fixture_owner',
  email: 'owner@example.test',
  displayName: 'Fixture Owner',
  roles: ['owner'],
  roleSummary: ['Owner'],
  permissions: [...PERMISSIONS],
  csrfToken: 'fixture-csrf-token',
  session: {
    absoluteExpiresAt: '2026-08-11T20:00:00.000Z',
    recentAuthenticationUntil: '2026-08-11T19:00:00.000Z'
  }
};

const collections = [{
  id: 'collection-1', title: 'Who Is God to You?', shortTitle: 'Collection 1', slug: 'who-is-god-to-you',
  status: 'published', publishStatus: 'published', availabilityStatus: 'available', productCount: 1,
  createdAt: '2026-08-01T12:00:00.000Z', updatedAt: '2026-08-11T12:00:00.000Z'
}];
const products = [{
  id: 'product-1', collectionId: 'collection-1', name: 'Is He Your Provider?', shortName: 'Your Provider',
  description: 'Fixture product', productType: 'apparel', sku: 'IZHE-PROVIDER', lookupKey: 'izhe_provider',
  unitAmount: 2999, currency: 'usd', status: 'published', publishStatus: 'published', availabilityStatus: 'available',
  giveOneEligible: true, giveOneGiftUnit: 1, images: [], variants: [], catalogRevision: 12,
  createdAt: '2026-08-01T12:00:00.000Z', updatedAt: '2026-08-11T12:00:00.000Z'
}];
const media = [{
  id: 'media-1', title: 'Approved church gathering', filename: 'church.webp', thumbnailUrl: '/images/hero.webp',
  altText: 'People gathered at church', category: 'church', usageStatus: 'approved_for_site_use', rightsStatus: 'cleared',
  productAccuracyStatus: 'confirmed', orientation: 'landscape', contentType: 'image/webp', width: 1200, height: 800,
  createdAt: '2026-08-01T12:00:00.000Z', updatedAt: '2026-08-11T12:00:00.000Z'
}];
const orders = [{
  id: 'cs_fixture_order', sessionId: 'cs_fixture_order', orderNumber: 'IZHE-1001', status: 'processing', paymentStatus: 'paid',
  amountTotal: 2999, currency: 'usd', campaignId: 'campaign-1', customerName: 'J••• D•••', customerEmail: 'j***@example.test',
  customerPhone: '•••-•••-1212', fulfillmentMode: 'individual_shipping', fulfillmentStatus: 'processing',
  trackingPresent: false, createdAt: '2026-08-10T12:00:00.000Z', updatedAt: '2026-08-11T12:00:00.000Z'
}];
const codes = [{
  id: 'GIVE-FIXTURE-0001', code: '••••0001', effectiveStatus: 'active', status: 'active', campaignId: 'campaign-1',
  orderId: 'cs_fixture_order', createdAt: '2026-08-10T12:00:00.000Z', updatedAt: '2026-08-11T12:00:00.000Z'
}];
const batches = [{
  id: 'BATCH-1', batchNumber: 'Batch 1', name: 'Fixture Batch', status: 'ready', campaignId: 'campaign-1', itemCount: 12,
  orderCount: 4, createdAt: '2026-08-10T12:00:00.000Z', updatedAt: '2026-08-11T12:00:00.000Z'
}];
const campaigns = [{
  id: 'campaign-1', name: 'Fixture Church Campaign', title: 'Fixture Church Campaign', churchName: 'Fixture Church', organization: 'Fixture Church',
  status: 'active', publishStatus: 'published', fulfillmentMode: 'church_batch', fulfillmentMethod: 'church_batch',
  startsAt: '2026-08-01T12:00:00.000Z', endsAt: '2026-08-30T12:00:00.000Z', updatedAt: '2026-08-11T12:00:00.000Z'
}];

function listFor(resource) {
  const map = {
    collections,
    products,
    media,
    orders,
    fulfillment: orders,
    pickup: [{ ...orders[0], id: 'cs_pickup', sessionId: 'cs_pickup', fulfillmentMode: 'church_batch', fulfillmentStatus: 'ready_for_pickup', pickupCode: '••••4321' }],
    'give-one-codes': codes,
    redemptions: [],
    batches,
    campaigns,
    inquiries: [],
    accountability: []
  };
  return map[resource] || [];
}

function detailFor(resource, id) {
  const found = listFor(resource).find((item) => item.id === id || item.sessionId === id);
  if (found) return found;
  if (resource === 'products') return products[0];
  if (resource === 'collections') return collections[0];
  return { id, status: 'active', createdAt: '2026-08-10T12:00:00.000Z', updatedAt: '2026-08-11T12:00:00.000Z' };
}

async function installApiFixtures(page) {
  await page.route('**/.netlify/functions/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const name = url.pathname.split('/').pop();
    const json = (body, status = 200, extra = {}) => route.fulfill({ status, contentType: 'application/json', headers: { 'cache-control': 'no-store', ...extra }, body: JSON.stringify(body) });

    if (name === 'admin-session') return json(session);
    if (name === 'admin-overview') return json({
      counts: { orders: 1, pendingOrders: 1, activeGiveOneCodes: 1, pendingRedemptions: 0, openBatches: 1, products: 1, publishedProducts: 1, campaigns: 1, media: 1 },
      alerts: [{ severity: 'warning', label: 'One paid order requires attention.', route: '/admin/operations/orders' }],
      recentActivity: [{ actorDisplayName: 'Fixture Owner', action: 'product.save', result: 'success', resourceType: 'product', resourceId: 'product-1', timestamp: '2026-08-11T12:00:00.000Z' }]
    });
    if (name === 'admin-list') {
      const resource = url.searchParams.get('resource') || '';
      const items = listFor(resource);
      return json({ resource, items, total: items.length, hasMore: false, nextCursor: null, catalogRevision: 12 });
    }
    if (name === 'admin-detail') {
      const resource = url.searchParams.get('resource') || '';
      const id = url.searchParams.get('id') || '';
      return json({ item: detailFor(resource, id), catalogRevision: 12, etag: 'fixture-etag' });
    }
    if (name === 'admin-content-data') return json({ library: {}, etag: 'content-etag', schemas: {}, preview: {} });
    if (name === 'admin-visual-editor') return json({ revision: 1, libraryRevision: 1, draft: { revision: 1, updatedAt: '2026-08-11T12:00:00.000Z' }, records: [], media: [], schemas: {} });
    if (name === 'admin-teaching-data') return json({ library: {}, etag: 'teaching-etag', files: [], options: { statuses: [], access: [], resourceTypes: [] } });
    if (name === 'admin-campaign-data') return json({ campaigns, inquiries: [], reports: [], alerts: [], summary: { campaignCount: 1, activeCampaignCount: 1 }, catalog: { collections, products } });
    if (name === 'admin-finance-data') return json({
      totals: { netCollected: 2999, verifiedNetDeposit: 2850, processorFees: 149, disputeLosses: 0, supportAccrued: 500, supportPaid: 0, supportOutstanding: 500, campaignCosts: 0, giveOneObligations: 1, giveOneOutstanding: 1 },
      campaigns: [{ campaignId: 'campaign-1', campaignTitle: 'Fixture Church Campaign', organization: 'Fixture Church', settlementStatus: 'open', supportAccrued: 500, supportPaid: 0, supportOutstanding: 500, campaignCosts: 0, giveOneObligations: 1, giveOneFulfilled: 0, giveOneOutstanding: 1, soldUnits: 1 }],
      general: null, alerts: [], ledgerEntryCount: 0, generatedAt: '2026-08-11T12:00:00.000Z'
    });
    if (name === 'admin-accountability-approvals') return json({ items: [] });
    if (name === 'admin-accountability-periods') return json({ items: [] });
    if (name === 'admin-financial-actions') return json({ items: [] });
    if (name === 'admin-users') return json({ users: [{ id: 'admin_fixture_owner', displayName: 'Fixture Owner', email: 'owner@example.test', status: 'active', roles: ['owner'], lastLoginAt: '2026-08-11T12:00:00.000Z' }], items: [{ id: 'admin_fixture_owner', displayName: 'Fixture Owner', email: 'owner@example.test', status: 'active', roles: ['owner'], lastLoginAt: '2026-08-11T12:00:00.000Z' }] });
    if (name === 'admin-sessions') return json({ sessions: [{ id: 'session-fixture', current: true, browser: 'Chromium', platform: 'Linux', createdAt: '2026-08-11T12:00:00.000Z', lastActivityAt: '2026-08-11T12:10:00.000Z', absoluteExpiresAt: '2026-08-11T20:00:00.000Z' }], items: [] });
    if (name === 'admin-audit') return json({ items: [{ eventId: 'audit-1', timestamp: '2026-08-11T12:00:00.000Z', actorDisplayName: 'Fixture Owner', actorEmail: 'owner@example.test', action: 'product.save', resourceType: 'product', resourceId: 'product-1', result: 'success' }], hasMore: false, integrity: { valid: true } });
    if (request.method() !== 'GET') return json({ ok: true, updatedAt: '2026-08-11T12:00:00.000Z' });
    return json({});
  });
}

async function openAdmin(page, pathname) {
  await installApiFixtures(page);
  await page.goto(pathname);
  await expect(page.locator('#admin-workspace')).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/admin-boot/);
}

async function assertNoBodyOverflow(page) {
  const sizes = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.client + 2);
}

const viewports = [
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1280x800', width: 1280, height: 800 },
  { name: '1024x768', width: 1024, height: 768 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '390x844', width: 390, height: 844 }
];

for (const viewport of viewports) {
  test(`Admin v2 shell is usable without horizontal application overflow at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openAdmin(page, '/admin/');
    await expect(page.getByRole('heading', { name: 'Overview', exact: true }).last()).toBeVisible();
    await assertNoBodyOverflow(page);
    if (viewport.width <= 768) {
      const navButton = page.getByRole('button', { name: 'Open navigation' });
      await expect(navButton).toBeVisible();
      await navButton.click();
      await expect(page.getByRole('navigation', { name: 'Administration navigation' })).toBeVisible();
    }
  });
}

test('Products, editor, and shared Media Library picker are consistent', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openAdmin(page, '/admin/catalog/products');
  await expect(page.getByRole('heading', { name: 'Products', exact: true }).last()).toBeVisible();
  await expect(page.getByRole('button', { name: 'New Product' })).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, 'products-1440.png'), fullPage: true });
  await page.getByRole('button', { name: 'New Product' }).click();
  await expect(page.getByText('Product identity')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose from Media Library' })).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, 'product-editor-1440.png'), fullPage: true });
  await page.getByRole('button', { name: 'Choose from Media Library' }).click();
  const pickerDialog = page.getByRole('dialog', { name: 'Media Library' });
  await expect(pickerDialog).toBeVisible();
  await expect(pickerDialog.getByText('Approved church gathering')).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, 'media-picker-1440.png'), fullPage: true });
});

test('Orders use progressive-disclosure filters and accessible row actions', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openAdmin(page, '/admin/operations/orders');
  await expect(page.getByRole('heading', { name: 'Orders', exact: true }).last()).toBeVisible();
  const moreFilters = page.getByRole('button', { name: /More Filters/i });
  await expect(moreFilters).toBeVisible();
  const before = await moreFilters.boundingBox();
  const search = await page.getByRole('searchbox', { name: /Search orders/i }).boundingBox();
  expect(before).not.toBeNull();
  expect(search).not.toBeNull();
  expect(Math.abs(before.y - search.y)).toBeLessThan(48);
  await moreFilters.click();
  const filtersDialog = page.getByRole('dialog', { name: 'More Filters' });
  await expect(filtersDialog).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, 'orders-filters-1440.png'), fullPage: true });
  await filtersDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(filtersDialog).toHaveCount(0);
  await expect(page.getByText('IZHE-1001')).toBeVisible();
  const actions = page.getByRole('button', { name: /More Actions for IZHE-1001/i });
  await actions.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu', { name: 'More Actions' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: 'More Actions' })).toHaveCount(0);
  await expect(actions).toBeFocused();
});

test('Campaign, accountability, administration and audit representative views render', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const views = [
    ['/admin/', 'Overview', 'overview-1440.png'],
    ['/admin/campaigns', 'Campaigns', 'campaigns-1440.png'],
    ['/admin/accountability', 'Accountability', 'accountability-1440.png'],
    ['/admin/administration/users', 'Administrators & Roles', 'administrators-1440.png'],
    ['/admin/administration/audit', 'Audit Log', 'audit-log-1440.png']
  ];
  await installApiFixtures(page);
  for (const [url, heading, screenshot] of views) {
    await page.goto(url);
    await expect(page.getByRole('heading', { name: heading, exact: true }).last()).toBeVisible();
    await assertNoBodyOverflow(page);
    await page.screenshot({ path: path.join(evidenceDir, screenshot), fullPage: true });
  }
});

test('mobile navigation and filter affordance remain accessible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openAdmin(page, '/admin/operations/orders');
  const navButton = page.getByRole('button', { name: 'Open navigation' });
  await expect(navButton).toBeVisible();
  await navButton.click();
  await expect(page.getByRole('navigation', { name: 'Administration navigation' })).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, 'mobile-navigation-390.png'), fullPage: true });
  await page.getByRole('button', { name: 'Close navigation' }).click();
  const filtersButton = page.getByRole('button', { name: 'Filters', exact: true });
  await expect(filtersButton).toBeVisible();
  await filtersButton.click();
  await expect(page.getByRole('dialog', { name: 'More Filters' })).toBeVisible();
});
