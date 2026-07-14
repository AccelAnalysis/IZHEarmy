import { getStore } from '@netlify/blobs';
import { json, methodNotAllowed } from './_shared/http.mjs';

async function listJSON(storeName, limit = 250) {
  const store = getStore(storeName);
  const { blobs } = await store.list();
  const selected = blobs.slice(-limit).reverse();
  const rows = [];
  for (const blob of selected) {
    const value = await store.get(blob.key, { type: 'json', consistency: 'strong' });
    if (value) rows.push(value);
  }
  return rows;
}

export default async (request) => {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!process.env.IZHE_ADMIN_TOKEN || token !== process.env.IZHE_ADMIN_TOKEN) return json({ error: 'Unauthorized.' }, 401);
  try {
    const [orders, redemptions, codes] = await Promise.all([
      listJSON('izhe-orders'),
      listJSON('izhe-redemptions'),
      listJSON('izhe-give-codes')
    ]);
    return json({ orders, redemptions, codes });
  } catch (error) {
    console.error('admin-data', error);
    return json({ error: 'Administrative data could not be loaded.' }, 500);
  }
};
