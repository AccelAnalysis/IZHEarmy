import { getStore } from '@netlify/blobs';
import { loadCatalog } from './_shared/catalog-service.mjs';
import { normalizeCode } from './_shared/codes.mjs';
import { json, methodNotAllowed } from './_shared/http.mjs';

function redemptionProduct(record, catalog) {
  const current = catalog.products.find((product) => product.id === record.productId);
  const snapshot = record.productSnapshot || {};
  const variants = (current?.variants?.length ? current.variants : snapshot.variants || [])
    .filter((variant) => variant.status !== 'disabled' && !['retired', 'sold_out'].includes(variant.availabilityStatus));
  return {
    id: current?.id || snapshot.id || record.productId,
    name: current?.name || snapshot.name || record.productName,
    variants
  };
}

export default async (request) => {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  const code = normalizeCode(new URL(request.url).searchParams.get('code'));
  if (!/^IZHE-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) return json({ error: 'Enter a valid IZHE claim code.' }, 400);
  const store = getStore('izhe-give-codes');
  const record = await store.get(code, { type: 'json', consistency: 'strong' });
  if (!record) return json({ error: 'This claim code was not found.' }, 404);
  if (record.status !== 'active') return json({ error: 'This claim code has already been redeemed or cancelled.' }, 409);
  const { catalog } = await loadCatalog();
  const product = redemptionProduct(record, catalog);
  if (!product.variants.length) return json({ error: 'The item linked to this code currently has no redeemable variants. Contact IZHE support.' }, 409);
  const fits = [...new Set(product.variants.map((variant) => variant.fit).filter(Boolean))];
  const sizes = [...new Set(product.variants.map((variant) => variant.size).filter(Boolean))];
  return json({
    valid: true,
    productId: product.id,
    productName: product.name,
    fits,
    sizes,
    variants: product.variants.map(({ id, fit, size, color }) => ({ id, fit, size, color }))
  });
};
