import { getStore } from '@netlify/blobs';
import { listLedgerEntries } from './accountability-service.mjs';
import { maskCode, maskEmail, maskPhone } from './admin-crypto.mjs';
import { decodeCursor, encodeCursor } from './admin-request.mjs';
import { loadCatalog } from './catalog-service.mjs';
import { listCampaigns, listInquiries } from './campaign-service.mjs';
import { listMedia } from './media-service.mjs';
import { effectiveCodeStatus } from './operations-rules.mjs';

export const RESOURCE_DEFINITIONS = Object.freeze({
  products: { permission: 'catalog.products.read', kind: 'catalog-products' },
  collections: { permission: 'catalog.collections.read', kind: 'catalog-collections' },
  media: { permission: 'media.read', kind: 'media' },
  orders: { permission: 'operations.orders.read', kind: 'blob', store: 'izhe-orders' },
  fulfillment: { permission: 'operations.fulfillment.read', kind: 'orders-filtered', mode: 'fulfillment' },
  'give-one-codes': { permission: 'operations.give_one.read', kind: 'blob', store: 'izhe-give-codes' },
  redemptions: { permission: 'operations.give_one.read', kind: 'blob', store: 'izhe-redemptions' },
  batches: { permission: 'operations.batches.read', kind: 'blob', store: 'izhe-production-batches' },
  pickup: { permission: 'operations.pickup.read', kind: 'orders-filtered', mode: 'church_batch' },
  campaigns: { permission: 'campaigns.read', kind: 'campaigns' },
  inquiries: { permission: 'campaigns.read', kind: 'inquiries' },
  accountability: { permission: 'accountability.read', kind: 'ledger' }
});

const first = (...values) => values.find((value) => value !== undefined && value !== null && value !== '');
const valueDate = (record) => String(first(record.updatedAt, record.createdAt, record.effectiveAt, record.paidAt, record.timestamp, '') || '');
const valueId = (record) => String(first(record.id, record.orderId, record.codeId, record.batchId, record.slug, record.sku, record.key, '') || '');
const cleanStatus = (record) => String(first(record.effectiveStatus, record.status, record.fulfillment?.status, record.paymentStatus, '') || '');

function maskName(value) {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  return parts.map((part) => `${part.slice(0, 1)}${part.length > 1 ? '•••' : ''}`).join(' ');
}

async function listBlobJSON(storeName, maxRecords = 10_000) {
  const store = getStore(storeName);
  const result = await store.list();
  const blobs = (result.blobs || []).filter((blob) => !blob.key.startsWith('lock-')).slice(-maxRecords);
  const rows = [];
  for (const blob of blobs) {
    const record = await store.get(blob.key, { type: 'json', consistency: 'strong' }).catch(() => null);
    if (record) rows.push(record);
  }
  return rows;
}

async function sourceRows(resource) {
  const definition = RESOURCE_DEFINITIONS[resource];
  if (!definition) throw Object.assign(new Error('Unknown administrative resource.'), { statusCode: 404 });
  if (definition.kind === 'catalog-products') return (await loadCatalog()).catalog.products || [];
  if (definition.kind === 'catalog-collections') return (await loadCatalog()).catalog.collections || [];
  if (definition.kind === 'media') return listMedia();
  if (definition.kind === 'campaigns') return listCampaigns();
  if (definition.kind === 'inquiries') return listInquiries();
  if (definition.kind === 'ledger') return listLedgerEntries(10_000);
  if (definition.kind === 'orders-filtered') {
    const orders = await listBlobJSON('izhe-orders');
    if (definition.mode === 'church_batch') return orders.filter((order) => order.fulfillment?.mode === 'church_batch');
    return orders.filter((order) => order.fulfillment || order.status);
  }
  return listBlobJSON(definition.store);
}

function searchableValues(resource, record) {
  const general = [
    valueId(record), record.name, record.title, record.shortName, record.sku, record.slug,
    record.status, record.campaignId, record.collectionId, record.batchId, record.orderNumber,
    record.customer?.name, record.customer?.email, record.customerName, record.customerEmail,
    record.email, record.churchName, record.ministryName, record.reference
  ];
  if (resource === 'media') general.push(record.filename, record.altText, record.category, record.tags?.join(' '));
  return general.filter(Boolean).join(' ').toLowerCase();
}

function withinDateRange(record, dateFrom, dateTo) {
  const raw = valueDate(record);
  if (!dateFrom && !dateTo) return true;
  const value = Date.parse(raw);
  if (!Number.isFinite(value)) return false;
  if (dateFrom && value < Date.parse(dateFrom)) return false;
  if (dateTo && value > Date.parse(dateTo)) return false;
  return true;
}

function compareRows(sort) {
  if (sort === 'name-asc') return (a, b) => String(first(a.name, a.title, a.shortName, valueId(a))).localeCompare(String(first(b.name, b.title, b.shortName, valueId(b))));
  if (sort === 'status-asc') return (a, b) => cleanStatus(a).localeCompare(cleanStatus(b)) || valueDate(b).localeCompare(valueDate(a));
  if (sort === 'created-asc') return (a, b) => valueDate(a).localeCompare(valueDate(b)) || valueId(a).localeCompare(valueId(b));
  return (a, b) => valueDate(b).localeCompare(valueDate(a)) || valueId(a).localeCompare(valueId(b));
}

function afterCursor(rows, rawCursor, sort) {
  const cursor = decodeCursor(rawCursor);
  if (!cursor) return rows;
  const index = rows.findIndex((record) => valueId(record) === cursor.id && valueDate(record) === cursor.date && sort === cursor.sort);
  return index >= 0 ? rows.slice(index + 1) : rows;
}

function listProjection(resource, record) {
  const id = valueId(record);
  const common = {
    id,
    status: cleanStatus(record),
    createdAt: record.createdAt || null,
    updatedAt: record.updatedAt || null
  };
  if (resource === 'products') return {
    ...common,
    name: first(record.name, record.title, record.shortName, id),
    shortName: record.shortName || '',
    sku: record.sku || '',
    collectionId: record.collectionId || '',
    productType: record.productType || record.type || '',
    unitAmount: first(record.unitAmount, record.price, null),
    currency: record.currency || 'usd',
    availability: record.availability || '',
    featured: Boolean(record.featured)
  };
  if (resource === 'collections') return {
    ...common,
    title: first(record.title, record.name, id),
    shortTitle: record.shortTitle || '',
    slug: record.slug || '',
    availability: record.availability || '',
    productCount: Number(record.productCount || 0),
    displayOrder: Number(record.displayOrder || 0)
  };
  if (resource === 'media') return {
    ...common,
    title: first(record.title, record.filename, id),
    filename: record.filename || '',
    thumbnailUrl: first(record.thumbnailUrl, record.url, ''),
    altText: record.altText || '',
    category: record.category || '',
    usageStatus: record.usageStatus || '',
    rightsStatus: record.rightsStatus || '',
    productAccuracy: record.productAccuracy || '',
    orientation: record.orientation || '',
    static: Boolean(record.static)
  };
  if (resource === 'orders' || resource === 'fulfillment' || resource === 'pickup') return {
    ...common,
    orderNumber: first(record.orderNumber, record.receiptNumber, id),
    paymentStatus: first(record.paymentStatus, record.payment?.captureStatus, ''),
    fulfillmentMode: record.fulfillment?.mode || '',
    fulfillmentStatus: first(record.fulfillment?.status, record.status, ''),
    campaignId: record.campaignId || '',
    batchId: first(record.batchId, record.fulfillment?.batchId, ''),
    amountTotal: first(record.amountTotal, record.total, record.payment?.amountTotal, null),
    currency: first(record.currency, record.payment?.currency, 'usd'),
    customerName: maskName(first(record.customer?.name, record.customerName, record.name, '')),
    customerEmail: maskEmail(first(record.customer?.email, record.customerEmail, record.email, '')),
    customerPhone: maskPhone(first(record.customer?.phone, record.customerPhone, record.phone, '')),
    pickupCode: maskCode(first(record.pickupCode, record.fulfillment?.pickupCode, '')),
    trackingPresent: Boolean(first(record.trackingNumber, record.fulfillment?.trackingNumber, '')),
    exception: Boolean(record.exception || record.exceptionState || record.fulfillment?.exception)
  };
  if (resource === 'give-one-codes') return {
    ...common,
    code: maskCode(first(record.code, id)),
    effectiveStatus: effectiveCodeStatus(record),
    campaignId: record.campaignId || '',
    orderId: record.orderId || '',
    expiresAt: record.expiresAt || null,
    redeemedAt: record.redeemedAt || null
  };
  if (resource === 'redemptions') return {
    ...common,
    code: maskCode(first(record.code, record.giveCode, '')),
    recipientEmail: maskEmail(first(record.recipientEmail, record.email, record.customer?.email, '')),
    recipientName: maskName(first(record.recipientName, record.name, record.customer?.name, '')),
    campaignId: record.campaignId || '',
    orderId: record.orderId || '',
    fulfillmentStatus: first(record.fulfillment?.status, record.status, '')
  };
  if (resource === 'batches') return {
    ...common,
    batchNumber: first(record.batchNumber, record.name, id),
    campaignId: record.campaignId || '',
    itemCount: Number(first(record.itemCount, record.items?.length, 0)),
    orderCount: Number(first(record.orderCount, record.orders?.length, 0)),
    submittedAt: record.submittedAt || null,
    receivedAt: record.receivedAt || null,
    completedAt: record.completedAt || null
  };
  if (resource === 'campaigns') return {
    ...common,
    name: first(record.name, record.title, record.churchName, id),
    slug: record.slug || '',
    churchName: record.churchName || record.organizationName || '',
    fulfillmentMode: record.fulfillmentMode || record.fulfillment?.mode || '',
    startsAt: first(record.startsAt, record.startDate, null),
    endsAt: first(record.endsAt, record.endDate, null),
    accountabilityStatus: record.accountabilityStatus || ''
  };
  if (resource === 'inquiries') return {
    ...common,
    churchName: first(record.churchName, record.organizationName, record.ministryName, id),
    contactName: maskName(first(record.contactName, record.name, '')),
    contactEmail: maskEmail(first(record.contactEmail, record.email, '')),
    contactPhone: maskPhone(first(record.contactPhone, record.phone, '')),
    linkedCampaignId: record.linkedCampaignId || ''
  };
  if (resource === 'accountability') return {
    ...common,
    type: record.type || '',
    campaignId: record.campaignId || '',
    amount: Number(record.amount || 0),
    currency: record.currency || 'usd',
    effectiveAt: record.effectiveAt || null,
    reference: record.reference ? `•••${String(record.reference).slice(-4)}` : '',
    approvalStatus: record.approvalStatus || ''
  };
  return common;
}

export function resourceDefinition(resource) {
  return RESOURCE_DEFINITIONS[resource] || null;
}

export async function listAdministrativeResource(resource, {
  search = '',
  status = '',
  dateFrom = '',
  dateTo = '',
  campaignId = '',
  collectionId = '',
  fulfillmentMode = '',
  sort = 'updated-desc',
  cursor = '',
  limit = 25
} = {}) {
  let rows = await sourceRows(resource);
  const query = String(search || '').trim().toLowerCase();
  rows = rows.filter((record) => {
    if (query && !searchableValues(resource, record).includes(query)) return false;
    if (status && cleanStatus(record) !== status && record.availability !== status && record.usageStatus !== status) return false;
    if (campaignId && record.campaignId !== campaignId) return false;
    if (collectionId && record.collectionId !== collectionId) return false;
    if (fulfillmentMode && record.fulfillment?.mode !== fulfillmentMode && record.fulfillmentMode !== fulfillmentMode) return false;
    return withinDateRange(record, dateFrom, dateTo);
  });
  rows.sort(compareRows(sort));
  const total = rows.length;
  rows = afterCursor(rows, cursor, sort);
  const bounded = Math.min(100, Math.max(1, Number(limit || 25)));
  const page = rows.slice(0, bounded);
  const hasMore = rows.length > bounded;
  const last = page.at(-1);
  return {
    items: page.map((record) => listProjection(resource, record)),
    total,
    hasMore,
    nextCursor: hasMore && last ? encodeCursor({ id: valueId(last), date: valueDate(last), sort }) : null
  };
}

export async function getAdministrativeResourceDetail(resource, id) {
  const rows = await sourceRows(resource);
  const record = rows.find((item) => valueId(item) === String(id || '')) || null;
  if (!record) throw Object.assign(new Error('Administrative record not found.'), { statusCode: 404 });
  const detail = structuredClone(record);
  if (resource === 'give-one-codes') detail.effectiveStatus = effectiveCodeStatus(detail);
  if (resource === 'products' || resource === 'collections') {
    const { etag, catalog } = await loadCatalog();
    return { item: detail, etag, catalogRevision: catalog.revision };
  }
  return { item: detail };
}

export async function administrativeResourceCounts() {
  const [catalogResult, media, orders, codes, redemptions, batches, campaigns, ledger] = await Promise.all([
    loadCatalog(),
    listMedia(),
    listBlobJSON('izhe-orders'),
    listBlobJSON('izhe-give-codes'),
    listBlobJSON('izhe-redemptions'),
    listBlobJSON('izhe-production-batches'),
    listCampaigns(),
    listLedgerEntries(10_000)
  ]);
  const catalog = catalogResult.catalog;
  return {
    collections: (catalog.collections || []).length,
    products: (catalog.products || []).length,
    publishedProducts: (catalog.products || []).filter((item) => item.status === 'published').length,
    media: media.length,
    orders: orders.length,
    pendingOrders: orders.filter((item) => !['completed', 'cancelled', 'refunded'].includes(item.status)).length,
    activeGiveOneCodes: codes.filter((item) => effectiveCodeStatus(item) === 'active').length,
    pendingRedemptions: redemptions.filter((item) => !['completed', 'cancelled'].includes(item.status)).length,
    openBatches: batches.filter((item) => !['completed', 'cancelled'].includes(item.status)).length,
    campaigns: campaigns.length,
    ledgerEntries: ledger.length,
    catalogRevision: catalog.revision,
    generatedAt: new Date().toISOString()
  };
}
