import { getStore } from '@netlify/blobs';
import { CATALOG } from './_shared/catalog.mjs';
import { createGiveCode } from './_shared/codes.mjs';
import { json, methodNotAllowed, cleanText } from './_shared/http.mjs';

export default async (request) => {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!process.env.IZHE_ADMIN_TOKEN || token !== process.env.IZHE_ADMIN_TOKEN) return json({ error: 'Unauthorized.' }, 401);
  try {
    const payload = await request.json();
    const product = CATALOG[cleanText(payload.productId, 80)];
    const count = Number(payload.count || 1);
    const orderRef = cleanText(payload.orderRef, 100) || 'manual';
    if (!product?.giveOneEligible) return json({ error: 'Select a valid Give One eligible shirt.' }, 400);
    if (!Number.isInteger(count) || count < 1 || count > 50) return json({ error: 'Count must be between 1 and 50.' }, 400);
    const store = getStore('izhe-give-codes');
    const created = [];
    for (let i = 0; i < count; i += 1) {
      let saved = false;
      for (let attempt = 0; attempt < 8 && !saved; attempt += 1) {
        const code = createGiveCode();
        const record = { code, status: 'active', productId: product.id, productName: product.name, sourceSessionId: orderRef, purchaserEmail: '', createdAt: new Date().toISOString(), redeemedAt: null, redemptionId: null };
        const result = await store.setJSON(code, record, { onlyIfNew: true });
        if (result.modified) { created.push(record); saved = true; }
      }
      if (!saved) throw new Error('Could not generate all requested codes.');
    }
    return json({ created });
  } catch (error) {
    console.error('admin-create-codes', error);
    return json({ error: error.message || 'Codes could not be created.' }, 400);
  }
};
