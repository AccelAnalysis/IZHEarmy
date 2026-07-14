import { getStore } from '@netlify/blobs';
import { requireAdmin } from './_shared/admin-auth.mjs';
import {
  computeOperationalAlerts,
  effectiveCodeStatus,
  filterRecords,
  summarizeOperations
} from './_shared/operations-rules.mjs';
import { json, methodNotAllowed } from './_shared/http.mjs';

async function listJSON(storeName, limit = 2000) {
  const store = getStore(storeName);
  const { blobs } = await store.list();
  const selected = blobs.slice(-limit).reverse();
  const rows = [];
  for (const blob of selected) {
    if (blob.key.startsWith('lock-')) continue;
    const value = await store.get(blob.key, { type: 'json', consistency: 'strong' });
    if (value) rows.push(value);
  }
  return rows;
}

function newestFirst(records) {
  return records.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
}

export default async (request) => {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const url = new URL(request.url);
    const filters = {
      q: url.searchParams.get('q') || '',
      from: url.searchParams.get('from') || '',
      to: url.searchParams.get('to') || ''
    };
    const [orders, redemptions, codes, batches] = await Promise.all([
      listJSON('izhe-orders'),
      listJSON('izhe-redemptions'),
      listJSON('izhe-give-codes'),
      listJSON('izhe-production-batches')
    ]);
    const all = { orders, redemptions, codes, batches };
    const filtered = {
      orders: newestFirst(filterRecords(orders, { ...filters, status: url.searchParams.get('orderStatus') || '' })),
      redemptions: newestFirst(filterRecords(redemptions, { ...filters, status: url.searchParams.get('redemptionStatus') || '' })),
      codes: newestFirst(filterRecords(codes, {
        ...filters,
        status: url.searchParams.get('codeStatus') || '',
        statusResolver: effectiveCodeStatus
      })).map((code) => ({ ...code, effectiveStatus: effectiveCodeStatus(code) })),
      batches: newestFirst(filterRecords(batches, { ...filters, status: url.searchParams.get('batchStatus') || '' }))
    };
    return json({
      ...filtered,
      totals: {
        orders: orders.length,
        redemptions: redemptions.length,
        codes: codes.length,
        batches: batches.length
      },
      summary: summarizeOperations(all),
      alerts: computeOperationalAlerts(all),
      generatedAt: new Date().toISOString()
    }, 200, { 'cache-control': 'no-store' });
  } catch (error) {
    console.error('admin-data', error);
    return json({ error: 'Administrative operations data could not be loaded.' }, 500);
  }
};
