import { getStore } from '@netlify/blobs';
import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import { hasPermission } from './_shared/admin-permissions.mjs';
import { boundedInteger, readJsonBody, requiredExplanation, text } from './_shared/admin-request.mjs';
import { effectiveCodeStatus, filterRecords } from './_shared/operations-rules.mjs';

async function listJSON(storeName, limit = 10_000) {
  const store = getStore(storeName);
  const { blobs } = await store.list();
  const rows = [];
  for (const blob of blobs.filter((item) => !item.key.startsWith('lock-')).slice(-limit).reverse()) {
    const value = await store.get(blob.key, { type: 'json', consistency: 'strong' }).catch(() => null);
    if (value) rows.push(value);
  }
  return rows;
}

function safeSpreadsheetValue(value) {
  const raw = String(value ?? '').replace(/[\r\n]+/g, ' ');
  return /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
}
const quote = (value) => `"${safeSpreadsheetValue(value).replaceAll('"', '""')}"`;
const csv = (rows) => `${rows.map((row) => row.map(quote).join(',')).join('\r\n')}\r\n`;
const address = (details) => {
  const value = details?.address || details || {};
  return [value.line1 || value.address1, value.line2 || value.address2, value.city, value.state, value.postal_code || value.postalCode, value.country].filter(Boolean).join(', ');
};

function orderRows(records) {
  return [
    ['Order ID', 'Created', 'Updated', 'Customer', 'Email', 'Phone', 'Payment Status', 'Operational Status', 'Amount', 'Currency', 'Fulfillment Mode', 'Shipping Address', 'Tracking', 'Shipping Provider', 'Batch Assignments', 'Give One Codes', 'Items', 'Internal Notes'],
    ...records.map((order) => [order.sessionId, order.createdAt, order.updatedAt, order.customerName, order.customerEmail, order.customerPhone, order.paymentStatus, order.status, Number(order.amountTotal || 0) / 100, order.currency, order.fulfillment?.mode || 'individual_shipping', address(order.shippingDetails), order.tracking, order.shippingProvider, (order.batchAssignments || []).map((item) => `${item.batchId}:${item.sourceItemId}`).join(' | '), (order.giveCodes || []).map((item) => item.code).join(' | '), (order.items || []).map((item) => `${item.quantity}x ${item.productName} ${item.fit || ''} ${item.size || ''}`.trim()).join(' | '), order.internalNotes])
  ];
}

function redemptionRows(records) {
  return [
    ['Confirmation', 'Code', 'Created', 'Updated', 'Status', 'Batch', 'Campaign', 'Product', 'Variant ID', 'Fit', 'Size', 'Color', 'Recipient', 'Email', 'Phone', 'Shipping Address', 'Tracking', 'Shipping Provider', 'Internal Notes'],
    ...records.map((record) => [record.confirmation, record.code, record.createdAt, record.updatedAt, record.status, record.batchId, record.campaignId, record.productName, record.variantId, record.fit, record.size, record.color, `${record.recipient?.firstName || ''} ${record.recipient?.lastName || ''}`.trim(), record.recipient?.email, record.recipient?.phone, address(record.recipient), record.tracking, record.shippingProvider, record.internalNotes])
  ];
}

function codeRows(records) {
  return [
    ['Code', 'Effective Status', 'Stored Status', 'Campaign', 'Product', 'Source Order', 'Purchaser Email', 'Created', 'Expires', 'Redeemed', 'Redemption ID', 'Replacement For', 'Replacement Code', 'Admin Note'],
    ...records.map((record) => [record.code, effectiveCodeStatus(record), record.status, record.campaignId, record.productName, record.sourceSessionId, record.purchaserEmail, record.createdAt, record.expiresAt, record.redeemedAt, record.redemptionId, record.replacementFor, record.replacementCode, record.adminNote])
  ];
}

function batchRows(records) {
  return [
    ['Batch ID', 'Name', 'Type', 'Campaign', 'Vendor', 'Status', 'Created', 'Updated', 'Due Date', 'Item Units', 'Tracking', 'Production Summary', 'Notes'],
    ...records.map((record) => [record.id, record.name, record.batchType, record.campaignId, record.vendor, record.status, record.createdAt, record.updatedAt, record.dueDate, record.itemCount, record.tracking, (record.productionSummary || []).map((item) => `${item.quantity}x ${item.productName} ${item.fit || ''} ${item.size || ''} ${item.color || ''}`.trim()).join(' | '), record.notes])
  ];
}

const EXPORTS = Object.freeze({
  orders: { store: 'izhe-orders', rows: orderRows, permission: 'operations.orders.export', statusResolver: (record) => record.status },
  redemptions: { store: 'izhe-redemptions', rows: redemptionRows, permission: 'operations.give_one.export', statusResolver: (record) => record.status },
  codes: { store: 'izhe-give-codes', rows: codeRows, permission: 'operations.give_one.export', statusResolver: effectiveCodeStatus },
  batches: { store: 'izhe-production-batches', rows: batchRows, permission: 'operations.batches.export', statusResolver: (record) => record.status }
});

function validDate(value, label) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) throw Object.assign(new Error(`${label} must be a valid date.`), { statusCode: 400 });
  return date;
}

export default adminEndpoint({
  methods: ['POST'],
  permission: 'overview.read',
  csrf: true,
  recentAuth: true,
  auditAction: 'operations.export',
  rateClass: 'export',
  contentTypes: ['application/json'],
  maxBodyBytes: 100_000
}, async (request, context) => {
  const body = await readJsonBody(request);
  const type = text(body.type, 40) || 'orders';
  const config = EXPORTS[type];
  if (!config) throw Object.assign(new Error('Unsupported export type.'), { statusCode: 400 });
  if (!hasPermission(context.permissions, config.permission)) throw Object.assign(new Error('You do not have permission to export this operational dataset.'), { statusCode: 403 });
  if (body.confirmExport !== true) throw Object.assign(new Error('Explicit confirmation is required for an operational export.'), { statusCode: 400 });
  const reason = requiredExplanation(body.reason);
  const from = validDate(body.from, 'from');
  const to = validDate(body.to, 'to');
  if (from && to && to < from) throw Object.assign(new Error('to must be on or after from.'), { statusCode: 400 });
  if (from && to && to - from > 92 * 24 * 60 * 60 * 1000) throw Object.assign(new Error('Operational exports are limited to a 92-day date range.'), { statusCode: 400 });
  const maxRows = boundedInteger(body.maxRows, 5_000, { min: 1, max: 5_000 });
  const records = await listJSON(config.store, 10_000);
  let filtered = filterRecords(records, { q: text(body.search, 200), status: text(body.status, 80), from: from?.toISOString() || '', to: to?.toISOString() || '', statusResolver: config.statusResolver });
  const campaignId = text(body.campaignId, 120);
  if (campaignId) filtered = filtered.filter((record) => record.campaignId === campaignId);
  if (filtered.length > maxRows) throw Object.assign(new Error(`The export contains ${filtered.length} rows, exceeding the ${maxRows}-row limit. Narrow the filters.`), { statusCode: 400 });
  const filename = `izhe-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
  return {
    response: new Response(csv(config.rows(filtered)), { status: 200, headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${filename}"`, 'cache-control': 'no-store' } }),
    audit: { resourceType: 'operational_export', resourceId: type, reason, afterSummary: { filename, rowCount: filtered.length, campaignId: campaignId || null, from: from?.toISOString() || null, to: to?.toISOString() || null, bounded: true, containsPII: ['orders', 'redemptions', 'codes'].includes(type) } }
  };
});
