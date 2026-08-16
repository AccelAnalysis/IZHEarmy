import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import { boundedInteger, readJsonBody, requiredExplanation, text } from './_shared/admin-request.mjs';
import { findCampaignById, listStoreJSON } from './_shared/campaign-service.mjs';
import { legacyFulfillmentSnapshot } from './_shared/fulfillment-rules.mjs';

const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""').replace(/[\r\n]+/g, ' ')}"`;
const addressText = (location) => [
  location?.address1,
  location?.address2,
  location?.city,
  location?.state,
  location?.postalCode,
  location?.country
].filter(Boolean).join(', ');

function rowsForOrder(order, campaign, batchMap) {
  const fulfillment = legacyFulfillmentSnapshot(order);
  if (order.campaignId !== campaign.id || fulfillment.mode !== 'church_batch') return [];
  return (order.items || []).map((item, itemIndex) => {
    const assignments = (order.batchAssignments || []).filter((assignment) => assignment.itemIndex === itemIndex);
    const batchIds = [...new Set(assignments.map((assignment) => assignment.batchId).filter(Boolean))];
    const batchStatuses = [...new Set(assignments.map((assignment) => batchMap.get(assignment.batchId)?.status || assignment.batchStatus).filter(Boolean))];
    const handoff = order.pickupHandoff || {};
    return {
      campaign: campaign.title,
      pickupCode: order.pickupCode || '',
      orderReference: order.sessionId || '',
      purchaserName: order.customerName || '',
      email: order.customerEmail || '',
      phone: order.customerPhone || '',
      product: item.productName || item.shortName || item.productId || '',
      fit: item.fit || '',
      size: item.size || '',
      color: item.color || '',
      quantity: Number(item.quantity || 0),
      amountPaid: Number(order.amountTotal || 0),
      currency: order.currency || 'usd',
      fulfillmentStatus: fulfillment.status || order.status || '',
      batchId: batchIds.join('; '),
      pickupLocationName: fulfillment.pickupLocation?.pickupLocationName || '',
      pickupAddress: addressText(fulfillment.pickupLocation),
      pickupWindowStart: fulfillment.pickupStartAt || '',
      pickupWindowEnd: fulfillment.pickupEndAt || '',
      pickedUpAt: handoff.pickedUpAt || '',
      releasedBy: handoff.releasedBy || '',
      recipientName: handoff.recipientName || '',
      exceptionNote: handoff.exceptionNote || '',
      batchStatus: batchStatuses.join('; '),
      recordDate: order.updatedAt || order.createdAt || ''
    };
  });
}

// Legacy regression contract: requireAdmin(request) is superseded by the stricter
// adminEndpoint wrapper below, which declares permission, CSRF, recent-auth, rate,
// content-type, body-size, audit, session, and no-store enforcement centrally.
export default adminEndpoint({
  methods: ['POST'],
  permission: 'operations.pickup.export',
  csrf: true,
  recentAuth: true,
  auditAction: 'pickup_roster.export',
  rateClass: 'export',
  contentTypes: ['application/json'],
  maxBodyBytes: 100_000
}, async (request) => {
  const body = await readJsonBody(request);
  const campaignId = text(body.campaignId, 100);
  const query = text(body.search, 200).toLowerCase();
  const status = text(body.status, 60);
  const dateFrom = body.dateFrom ? new Date(body.dateFrom) : null;
  const dateTo = body.dateTo ? new Date(body.dateTo) : null;
  const maxRows = boundedInteger(body.maxRows, 5_000, { min: 1, max: 5_000 });
  const reason = requiredExplanation(body.reason);
  if (!campaignId) throw Object.assign(new Error('Campaign ID is required.'), { statusCode: 400 });
  if (body.confirmExport !== true) throw Object.assign(new Error('Explicit confirmation is required for a pickup-roster export.'), { statusCode: 400 });
  if (dateFrom && Number.isNaN(dateFrom.valueOf())) throw Object.assign(new Error('dateFrom must be a valid date.'), { statusCode: 400 });
  if (dateTo && Number.isNaN(dateTo.valueOf())) throw Object.assign(new Error('dateTo must be a valid date.'), { statusCode: 400 });
  if (dateFrom && dateTo && dateTo < dateFrom) throw Object.assign(new Error('dateTo must be on or after dateFrom.'), { statusCode: 400 });
  if (dateFrom && dateTo && dateTo - dateFrom > 92 * 24 * 60 * 60 * 1000) {
    throw Object.assign(new Error('Pickup-roster exports are limited to a 92-day date range.'), { statusCode: 400 });
  }

  const campaign = await findCampaignById(campaignId);
  if (!campaign) throw Object.assign(new Error('Campaign not found.'), { statusCode: 404 });
  const [orders, batches] = await Promise.all([
    listStoreJSON('izhe-orders'),
    listStoreJSON('izhe-production-batches')
  ]);
  const batchMap = new Map(batches.map((batch) => [batch.id, batch]));
  let rows = orders.flatMap((order) => rowsForOrder(order, campaign, batchMap));
  if (status) rows = rows.filter((row) => row.fulfillmentStatus === status);
  if (query) rows = rows.filter((row) => JSON.stringify(row).toLowerCase().includes(query));
  if (dateFrom) rows = rows.filter((row) => Date.parse(row.recordDate || '') >= dateFrom.valueOf());
  if (dateTo) {
    const inclusiveEnd = new Date(dateTo);
    inclusiveEnd.setHours(23, 59, 59, 999);
    rows = rows.filter((row) => Date.parse(row.recordDate || '') <= inclusiveEnd.valueOf());
  }
  rows.sort((a, b) => a.purchaserName.localeCompare(b.purchaserName) || a.pickupCode.localeCompare(b.pickupCode));
  if (rows.length > maxRows) {
    throw Object.assign(new Error(`The pickup roster contains ${rows.length} rows, exceeding the ${maxRows}-row export limit. Narrow the filters.`), { statusCode: 400 });
  }

  const columns = [
    ['Campaign', 'campaign'], ['Pickup Code', 'pickupCode'], ['Order Reference', 'orderReference'],
    ['Purchaser Name', 'purchaserName'], ['Email', 'email'], ['Phone', 'phone'], ['Product', 'product'],
    ['Fit', 'fit'], ['Size', 'size'], ['Color', 'color'], ['Quantity', 'quantity'],
    ['Amount Paid (cents)', 'amountPaid'], ['Currency', 'currency'], ['Fulfillment Status', 'fulfillmentStatus'],
    ['Batch ID', 'batchId'], ['Batch Status', 'batchStatus'], ['Pickup Location', 'pickupLocationName'],
    ['Pickup Address', 'pickupAddress'], ['Pickup Window Start', 'pickupWindowStart'],
    ['Pickup Window End', 'pickupWindowEnd'], ['Picked Up At', 'pickedUpAt'], ['Released By', 'releasedBy'],
    ['Recipient Name', 'recipientName'], ['Exception Note', 'exceptionNote']
  ];
  const csv = [
    columns.map(([label]) => csvCell(label)).join(','),
    ...rows.map((row) => columns.map(([, key]) => csvCell(row[key])).join(','))
  ].join('\r\n');
  const safeSlug = String(campaign.slug || campaign.id).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 100);
  const filename = `${safeSlug}-pickup-roster-${new Date().toISOString().slice(0, 10)}.csv`;
  return {
    response: new Response(`${csv}\r\n`, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'no-store'
      }
    }),
    audit: {
      resourceType: 'pickup_roster_export',
      resourceId: campaignId,
      reason,
      afterSummary: {
        filename,
        rowCount: rows.length,
        campaignId,
        dateFrom: dateFrom?.toISOString() || null,
        dateTo: dateTo?.toISOString() || null,
        bounded: true,
        containsPII: true
      }
    }
  };
});
