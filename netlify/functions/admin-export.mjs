import { getStore } from '@netlify/blobs';
import { requireAdmin } from './_shared/admin-auth.mjs';
import { effectiveCodeStatus, filterRecords } from './_shared/operations-rules.mjs';

async function listJSON(storeName, limit = 5000) {
  const store = getStore(storeName);
  const { blobs } = await store.list();
  const rows = [];
  for (const blob of blobs.slice(-limit).reverse()) {
    if (blob.key.startsWith('lock-')) continue;
    const value = await store.get(blob.key, { type: 'json', consistency: 'strong' });
    if (value) rows.push(value);
  }
  return rows;
}

const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
const csv = (rows) => rows.map((row) => row.map(quote).join(',')).join('\n');
const address = (details) => {
  const value = details?.address || details || {};
  return [value.line1 || value.address1, value.line2 || value.address2, value.city, value.state, value.postal_code || value.postalCode, value.country].filter(Boolean).join(', ');
};

function orderRows(records) {
  return [
    ['Order ID', 'Created', 'Updated', 'Customer', 'Email', 'Payment Status', 'Operational Status', 'Amount', 'Currency', 'Shipping Address', 'Tracking', 'Shipping Provider', 'Batch Assignments', 'Give One Codes', 'Items', 'Internal Notes'],
    ...records.map((order) => [
      order.sessionId,
      order.createdAt,
      order.updatedAt,
      order.customerName,
      order.customerEmail,
      order.paymentStatus,
      order.status,
      Number(order.amountTotal || 0) / 100,
      order.currency,
      address(order.shippingDetails),
      order.tracking,
      order.shippingProvider,
      (order.batchAssignments || []).map((item) => `${item.batchId}:${item.sourceItemId}`).join(' | '),
      (order.giveCodes || []).map((item) => item.code).join(' | '),
      (order.items || []).map((item) => `${item.quantity}x ${item.productName} ${item.fit || ''} ${item.size || ''}`.trim()).join(' | '),
      order.internalNotes
    ])
  ];
}

function redemptionRows(records) {
  return [
    ['Confirmation', 'Code', 'Created', 'Updated', 'Status', 'Batch', 'Product', 'Variant ID', 'Fit', 'Size', 'Color', 'Recipient', 'Email', 'Shipping Address', 'Tracking', 'Shipping Provider', 'Internal Notes'],
    ...records.map((record) => [
      record.confirmation,
      record.code,
      record.createdAt,
      record.updatedAt,
      record.status,
      record.batchId,
      record.productName,
      record.variantId,
      record.fit,
      record.size,
      record.color,
      `${record.recipient?.firstName || ''} ${record.recipient?.lastName || ''}`.trim(),
      record.recipient?.email,
      address(record.recipient),
      record.tracking,
      record.shippingProvider,
      record.internalNotes
    ])
  ];
}

function codeRows(records) {
  return [
    ['Code', 'Effective Status', 'Stored Status', 'Product', 'Source Order', 'Purchaser Email', 'Created', 'Expires', 'Redeemed', 'Redemption ID', 'Replacement For', 'Replacement Code', 'Admin Note'],
    ...records.map((record) => [
      record.code,
      effectiveCodeStatus(record),
      record.status,
      record.productName,
      record.sourceSessionId,
      record.purchaserEmail,
      record.createdAt,
      record.expiresAt,
      record.redeemedAt,
      record.redemptionId,
      record.replacementFor,
      record.replacementCode,
      record.adminNote
    ])
  ];
}

function batchRows(records) {
  return [
    ['Batch ID', 'Name', 'Vendor', 'Status', 'Created', 'Updated', 'Due Date', 'Item Units', 'Tracking', 'Production Summary', 'Notes'],
    ...records.map((record) => [
      record.id,
      record.name,
      record.vendor,
      record.status,
      record.createdAt,
      record.updatedAt,
      record.dueDate,
      record.itemCount,
      record.tracking,
      (record.productionSummary || []).map((item) => `${item.quantity}x ${item.productName} ${item.fit || ''} ${item.size || ''} ${item.color || ''}`.trim()).join(' | '),
      record.notes
    ])
  ];
}

export default async (request) => {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: { allow: 'GET' } });
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const url = new URL(request.url);
    const type = url.searchParams.get('type') || 'orders';
    const config = {
      orders: { store: 'izhe-orders', rows: orderRows, statusResolver: (record) => record.status },
      redemptions: { store: 'izhe-redemptions', rows: redemptionRows, statusResolver: (record) => record.status },
      codes: { store: 'izhe-give-codes', rows: codeRows, statusResolver: effectiveCodeStatus },
      batches: { store: 'izhe-production-batches', rows: batchRows, statusResolver: (record) => record.status }
    }[type];
    if (!config) return new Response('Unsupported export type', { status: 400 });
    const records = await listJSON(config.store);
    const filtered = filterRecords(records, {
      q: url.searchParams.get('q') || '',
      status: url.searchParams.get('status') || '',
      from: url.searchParams.get('from') || '',
      to: url.searchParams.get('to') || '',
      statusResolver: config.statusResolver
    });
    return new Response(csv(config.rows(filtered)), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="izhe-${type}-${new Date().toISOString().slice(0, 10)}.csv"`,
        'cache-control': 'no-store'
      }
    });
  } catch (error) {
    console.error('admin-export', error);
    return new Response('Export could not be generated.', { status: 500 });
  }
};
