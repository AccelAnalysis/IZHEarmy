import { getStore } from '@netlify/blobs';
import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import { hasPermission } from './_shared/admin-permissions.mjs';
import { computeOperationalAlerts, summarizeOperations } from './_shared/operations-rules.mjs';
import { json } from './_shared/http.mjs';

async function listJSON(storeName, limit = 10_000) {
  const store = getStore(storeName);
  const { blobs } = await store.list();
  const selected = blobs.filter((blob) => !blob.key.startsWith('lock-')).slice(-limit);
  const rows = [];
  for (const blob of selected) {
    const value = await store.get(blob.key, { type: 'json', consistency: 'strong' }).catch(() => null);
    if (value) rows.push(value);
  }
  return rows;
}

export default adminEndpoint({
  methods: ['GET'],
  permission: 'operations.orders.read',
  csrf: false,
  recentAuth: false,
  auditAction: 'operations.read',
  rateClass: 'read'
}, async (_request, context) => {
  const canReadGiveOne = hasPermission(context.permissions, 'operations.give_one.read');
  const canReadBatches = hasPermission(context.permissions, 'operations.batches.read');
  const [orders, redemptions, codes, batches] = await Promise.all([
    listJSON('izhe-orders'),
    canReadGiveOne ? listJSON('izhe-redemptions') : [],
    canReadGiveOne ? listJSON('izhe-give-codes') : [],
    canReadBatches ? listJSON('izhe-production-batches') : []
  ]);
  const all = { orders, redemptions, codes, batches };
  return json({
    totals: {
      orders: orders.length,
      redemptions: canReadGiveOne ? redemptions.length : null,
      codes: canReadGiveOne ? codes.length : null,
      batches: canReadBatches ? batches.length : null
    },
    summary: summarizeOperations(all),
    alerts: computeOperationalAlerts(all).slice(0, 50),
    recordsIncluded: false,
    listEndpoint: '/.netlify/functions/admin-list',
    detailEndpoint: '/.netlify/functions/admin-detail',
    generatedAt: new Date().toISOString()
  });
});
