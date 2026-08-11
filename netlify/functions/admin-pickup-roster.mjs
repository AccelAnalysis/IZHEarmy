import { requireAdmin } from './_shared/admin-auth.mjs';
import { findCampaignById, listStoreJSON } from './_shared/campaign-service.mjs';
import { legacyFulfillmentSnapshot } from './_shared/fulfillment-rules.mjs';
import { cleanText, json, methodNotAllowed } from './_shared/http.mjs';

const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
const addressText = (location) => [location?.address1, location?.address2, location?.city, location?.state, location?.postalCode, location?.country].filter(Boolean).join(', ');
function rowsForOrder(order, campaign, batchMap) {
  const fulfillment = legacyFulfillmentSnapshot(order); if (order.campaignId !== campaign.id || fulfillment.mode !== 'church_batch') return [];
  return (order.items || []).map((item, itemIndex) => {
    const assignments = (order.batchAssignments || []).filter((assignment) => assignment.itemIndex === itemIndex);
    const batchIds = [...new Set(assignments.map((assignment) => assignment.batchId).filter(Boolean))];
    const batchStatuses = [...new Set(assignments.map((assignment) => batchMap.get(assignment.batchId)?.status || assignment.batchStatus).filter(Boolean))];
    const handoff = order.pickupHandoff || {};
    return {
      campaign: campaign.title, pickupCode: order.pickupCode || '', orderReference: order.sessionId || '', purchaserName: order.customerName || '', email: order.customerEmail || '', phone: order.customerPhone || '',
      product: item.productName || item.shortName || item.productId || '', fit: item.fit || '', size: item.size || '', color: item.color || '', quantity: Number(item.quantity || 0), amountPaid: Number(order.amountTotal || 0), currency: order.currency || 'usd',
      fulfillmentStatus: fulfillment.status || order.status || '', batchId: batchIds.join('; '), pickupLocationName: fulfillment.pickupLocation?.pickupLocationName || '', pickupAddress: addressText(fulfillment.pickupLocation), pickupWindowStart: fulfillment.pickupStartAt || '', pickupWindowEnd: fulfillment.pickupEndAt || '',
      pickedUpAt: handoff.pickedUpAt || '', releasedBy: handoff.releasedBy || '', recipientName: handoff.recipientName || '', exceptionNote: handoff.exceptionNote || '', batchStatus: batchStatuses.join('; ')
    };
  });
}

export default async (request) => {
  if (request.method !== 'GET') return methodNotAllowed(['GET']); const denied = requireAdmin(request); if (denied) return denied;
  try {
    const url = new URL(request.url); const campaignId = cleanText(url.searchParams.get('campaignId'), 100); const q = cleanText(url.searchParams.get('q'), 200).toLowerCase(); const status = cleanText(url.searchParams.get('status'), 60); const format = cleanText(url.searchParams.get('format'), 20); if (!campaignId) return json({ error: 'Campaign ID is required.' }, 400);
    const campaign = await findCampaignById(campaignId); if (!campaign) return json({ error: 'Campaign not found.' }, 404);
    const [orders, batches] = await Promise.all([listStoreJSON('izhe-orders'), listStoreJSON('izhe-production-batches')]); const batchMap = new Map(batches.map((batch) => [batch.id, batch])); let rows = orders.flatMap((order) => rowsForOrder(order, campaign, batchMap)); if (status) rows = rows.filter((row) => row.fulfillmentStatus === status); if (q) rows = rows.filter((row) => JSON.stringify(row).toLowerCase().includes(q)); rows.sort((a, b) => a.purchaserName.localeCompare(b.purchaserName) || a.pickupCode.localeCompare(b.pickupCode));
    if (format === 'csv') { const columns = [['Campaign','campaign'],['Pickup Code','pickupCode'],['Order Reference','orderReference'],['Purchaser Name','purchaserName'],['Email','email'],['Phone','phone'],['Product','product'],['Fit','fit'],['Size','size'],['Color','color'],['Quantity','quantity'],['Amount Paid (cents)','amountPaid'],['Currency','currency'],['Fulfillment Status','fulfillmentStatus'],['Batch ID','batchId'],['Batch Status','batchStatus'],['Pickup Location','pickupLocationName'],['Pickup Address','pickupAddress'],['Pickup Window Start','pickupWindowStart'],['Pickup Window End','pickupWindowEnd'],['Picked Up At','pickedUpAt'],['Released By','releasedBy'],['Recipient Name','recipientName'],['Exception Note','exceptionNote']]; const csv = [columns.map(([label]) => csvCell(label)).join(','), ...rows.map((row) => columns.map(([, key]) => csvCell(row[key])).join(','))].join('\r\n'); return new Response(csv, { status: 200, headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${campaign.slug || campaign.id}-pickup-roster.csv"`, 'cache-control': 'no-store' } }); }
    return json({ campaign: { id: campaign.id, title: campaign.title, organization: campaign.organization }, rows, generatedAt: new Date().toISOString() }, 200, { 'cache-control': 'no-store' });
  } catch (error) { console.error('admin-pickup-roster', error); return json({ error: error.message || 'Pickup roster could not be generated.' }, 400); }
};
