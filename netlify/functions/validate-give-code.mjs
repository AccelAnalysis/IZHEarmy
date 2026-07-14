import { getStore } from '@netlify/blobs';
import { CATALOG } from './_shared/catalog.mjs';
import { normalizeCode } from './_shared/codes.mjs';
import { json, methodNotAllowed } from './_shared/http.mjs';

export default async (request) => {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  const code = normalizeCode(new URL(request.url).searchParams.get('code'));
  if (!/^IZHE-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) return json({ error: 'Enter a valid IZHE claim code.' }, 400);
  const store = getStore('izhe-give-codes');
  const record = await store.get(code, { type: 'json', consistency: 'strong' });
  if (!record) return json({ error: 'This claim code was not found.' }, 404);
  if (record.status !== 'active') return json({ error: 'This claim code has already been redeemed.' }, 409);
  const product = CATALOG[record.productId];
  if (!product?.giveOneEligible) return json({ error: 'The item linked to this code is unavailable.' }, 410);
  return json({
    valid: true,
    productId: product.id,
    productName: product.name,
    audience: product.audience,
    audienceLabel: product.audienceLabel,
    fits: product.fits,
    sizes: product.sizes
  });
};
