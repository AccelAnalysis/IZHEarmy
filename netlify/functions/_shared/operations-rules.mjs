export const ORDER_STATUSES = [
  'paid',
  'processing',
  'allocated',
  'in_production',
  'ready_to_ship',
  'shipped',
  'delivered',
  'completed',
  'on_hold',
  'cancelled',
  'refunded_or_disputed',
  'refund_requires_review',
  'exception'
];

export const REDEMPTION_STATUSES = [
  'pending_fulfillment',
  'approved',
  'allocated',
  'in_production',
  'ready_to_ship',
  'shipped',
  'delivered',
  'fulfilled',
  'on_hold',
  'cancelled',
  'exception'
];

export const BATCH_STATUSES = [
  'draft',
  'ready',
  'submitted',
  'in_production',
  'received',
  'completed',
  'cancelled'
];

export const CODE_STATUSES = ['active', 'redeemed', 'cancelled', 'expired', 'reissued'];

const TERMINAL_ORDER = new Set(['completed', 'cancelled', 'refunded_or_disputed']);
const TERMINAL_REDEMPTION = new Set(['fulfilled', 'cancelled']);
const TERMINAL_BATCH = new Set(['completed', 'cancelled']);

export function appendStatusHistory(record, status, note = '', actor = 'admin') {
  const history = Array.isArray(record?.statusHistory) ? record.statusHistory : [];
  const latest = history.at(-1);
  if (latest?.status === status && !note) return history;
  return [...history, {
    status,
    note: String(note || '').trim().slice(0, 500),
    actor,
    at: new Date().toISOString()
  }].slice(-100);
}

export function effectiveCodeStatus(code, now = new Date()) {
  if (code?.status !== 'active') return code?.status || 'active';
  if (!code?.expiresAt) return 'active';
  const expiry = new Date(code.expiresAt);
  return !Number.isNaN(expiry.valueOf()) && expiry < now ? 'expired' : 'active';
}

export function normalizeSearchText(record) {
  const chunks = [];
  const visit = (value, depth = 0) => {
    if (depth > 4 || value == null) return;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      chunks.push(String(value));
      return;
    }
    if (Array.isArray(value)) {
      value.slice(0, 50).forEach((item) => visit(item, depth + 1));
      return;
    }
    if (typeof value === 'object') {
      Object.values(value).slice(0, 80).forEach((item) => visit(item, depth + 1));
    }
  };
  visit(record);
  return chunks.join(' ').toLowerCase();
}

export function recordDate(record) {
  return new Date(record?.updatedAt || record?.createdAt || record?.redeemedAt || 0);
}

export function filterRecords(records, {
  q = '',
  status = '',
  from = '',
  to = '',
  statusResolver = (record) => record?.status || ''
} = {}) {
  const query = String(q || '').trim().toLowerCase();
  const start = from ? new Date(from) : null;
  const end = to ? new Date(to) : null;
  if (end && !Number.isNaN(end.valueOf())) end.setHours(23, 59, 59, 999);
  return (records || []).filter((record) => {
    if (status && statusResolver(record) !== status) return false;
    const date = recordDate(record);
    if (start && !Number.isNaN(start.valueOf()) && date < start) return false;
    if (end && !Number.isNaN(end.valueOf()) && date > end) return false;
    if (query && !normalizeSearchText(record).includes(query)) return false;
    return true;
  });
}

export function summarizeOperations({ orders = [], redemptions = [], codes = [], batches = [] }, now = new Date()) {
  const activeCodes = codes.filter((code) => effectiveCodeStatus(code, now) === 'active');
  const pendingOrders = orders.filter((order) => !TERMINAL_ORDER.has(order.status));
  const pendingRedemptions = redemptions.filter((redemption) => !TERMINAL_REDEMPTION.has(redemption.status));
  const openBatches = batches.filter((batch) => !TERMINAL_BATCH.has(batch.status));
  const grossSales = orders
    .filter((order) => !['cancelled', 'refunded_or_disputed'].includes(order.status))
    .reduce((total, order) => total + Number(order.amountTotal || 0), 0);
  const soldUnits = orders.reduce((total, order) => total + (order.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0), 0);
  const giftUnits = redemptions.filter((redemption) => !['cancelled'].includes(redemption.status)).length;
  return {
    orderCount: orders.length,
    pendingOrderCount: pendingOrders.length,
    redemptionCount: redemptions.length,
    pendingRedemptionCount: pendingRedemptions.length,
    codeCount: codes.length,
    activeCodeCount: activeCodes.length,
    batchCount: batches.length,
    openBatchCount: openBatches.length,
    grossSales,
    soldUnits,
    giftUnits
  };
}

function ageInDays(value, now) {
  const date = new Date(value || 0);
  if (Number.isNaN(date.valueOf())) return 0;
  return (now.valueOf() - date.valueOf()) / 86400000;
}

export function computeOperationalAlerts({ orders = [], redemptions = [], codes = [], batches = [] }, now = new Date()) {
  const alerts = [];
  const push = (severity, type, id, title, message, createdAt, actionTab) => alerts.push({
    id: `${type}:${id}`,
    severity,
    type,
    recordId: id,
    title,
    message,
    createdAt: createdAt || now.toISOString(),
    actionTab
  });

  for (const order of orders) {
    const id = order.sessionId || order.id || 'unknown-order';
    if (['refund_requires_review', 'exception'].includes(order.status)) {
      push('critical', 'order', id, 'Order requires review', `${order.customerEmail || id} is marked ${order.status.replaceAll('_', ' ')}.`, order.updatedAt || order.createdAt, 'orders');
    }
    if (!order.shippingDetails && !['cancelled', 'refunded_or_disputed'].includes(order.status)) {
      push('warning', 'order', id, 'Shipping details missing', `Order ${id} does not have a shipping address.`, order.createdAt, 'orders');
    }
    if (['paid', 'processing'].includes(order.status) && ageInDays(order.createdAt, now) >= 3) {
      push('warning', 'order', id, 'Paid order not allocated', `Order ${id} has remained ${order.status} for at least 3 days.`, order.createdAt, 'orders');
    }
    if (order.status === 'shipped' && !order.tracking) {
      push('warning', 'order', id, 'Tracking number missing', `Order ${id} is marked shipped without tracking information.`, order.updatedAt, 'orders');
    }
  }

  for (const redemption of redemptions) {
    const id = redemption.confirmation || 'unknown-redemption';
    if (redemption.status === 'exception') {
      push('critical', 'redemption', id, 'Gift fulfillment exception', `${id} requires operational review.`, redemption.updatedAt || redemption.createdAt, 'fulfillment');
    }
    if (['pending_fulfillment', 'approved'].includes(redemption.status) && ageInDays(redemption.createdAt, now) >= 3) {
      push('warning', 'redemption', id, 'Gift not allocated', `${id} has waited at least 3 days for production allocation.`, redemption.createdAt, 'fulfillment');
    }
    if (redemption.status === 'shipped' && !redemption.tracking) {
      push('warning', 'redemption', id, 'Gift tracking missing', `${id} is marked shipped without tracking information.`, redemption.updatedAt, 'fulfillment');
    }
  }

  for (const code of codes) {
    const status = effectiveCodeStatus(code, now);
    if (status === 'active' && ageInDays(code.createdAt, now) >= 30) {
      push('info', 'code', code.code, 'Give One code unclaimed', `${code.code} has remained active for at least 30 days.`, code.createdAt, 'give-one');
    }
    if (status === 'expired') {
      push('info', 'code', code.code, 'Give One code expired', `${code.code} has passed its expiration date.`, code.expiresAt, 'give-one');
    }
    if (!code.sourceSessionId) {
      push('warning', 'code', code.code, 'Code missing source reference', `${code.code} is not linked to a paid or manual order reference.`, code.createdAt, 'give-one');
    }
  }

  for (const batch of batches) {
    const id = batch.id || 'unknown-batch';
    if (batch.status === 'cancelled') continue;
    const dueDate = batch.dueDate ? new Date(batch.dueDate) : null;
    if (dueDate && !Number.isNaN(dueDate.valueOf()) && dueDate < now && batch.status !== 'completed') {
      push('critical', 'batch', id, 'Production batch overdue', `${batch.name || id} was due ${dueDate.toLocaleDateString()}.`, batch.dueDate, 'batches');
    }
    if (['submitted', 'in_production'].includes(batch.status) && (!batch.items || batch.items.length === 0)) {
      push('warning', 'batch', id, 'Production batch has no items', `${batch.name || id} is ${batch.status.replaceAll('_', ' ')} with no assigned items.`, batch.updatedAt || batch.createdAt, 'batches');
    }
  }

  const severityRank = { critical: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || new Date(a.createdAt) - new Date(b.createdAt));
}

export function batchProductionSummary(items = []) {
  const groups = new Map();
  for (const item of items) {
    const key = [item.productId, item.variantId, item.fit, item.size, item.color].join('|');
    const existing = groups.get(key) || {
      productId: item.productId || '',
      productName: item.productName || '',
      variantId: item.variantId || '',
      fit: item.fit || '',
      size: item.size || '',
      color: item.color || '',
      sku: item.variantSku || item.sku || '',
      quantity: 0
    };
    existing.quantity += Number(item.quantity || 0);
    groups.set(key, existing);
  }
  return [...groups.values()].sort((a, b) => a.productName.localeCompare(b.productName) || a.fit.localeCompare(b.fit) || a.size.localeCompare(b.size));
}

export function createBatchId(now = new Date(), random = Math.random()) {
  const date = now.toISOString().slice(0, 10).replaceAll('-', '');
  const suffix = Math.floor(random * 1679616).toString(36).toUpperCase().padStart(4, '0');
  return `BATCH-${date}-${suffix}`;
}
