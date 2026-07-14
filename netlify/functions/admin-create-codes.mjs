import { getStore } from '@netlify/blobs';
import { requireAdmin } from './_shared/admin-auth.mjs';
import { loadCatalog, primaryImage } from './_shared/catalog-service.mjs';
import { createGiveCode } from './_shared/codes.mjs';
import { json, methodNotAllowed, cleanText } from './_shared/http.mjs';

export default async (request) => {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const payload = await request.json();
    const { catalog } = await loadCatalog();
    const product = catalog.products.find((candidate) => candidate.id === cleanText(payload.productId, 80));
    const count = Number(payload.count || 1);
    const orderRef = cleanText(payload.orderRef, 100) || 'manual';
    if (!product || !product.giveOneEligible) return json({ error: 'Select a Give One eligible product.' }, 400);
    if (!Number.isInteger(count) || count < 1 || count > 50) return json({ error: 'Count must be between 1 and 50.' }, 400);
    const store = getStore('izhe-give-codes');
    const created = [];
    const eligibleVariants = (product.variants || []).filter((variant) => variant.status !== 'disabled' && variant.availabilityStatus !== 'retired');
    for (let i = 0; i < count; i += 1) {
      let saved = false;
      for (let attempt = 0; attempt < 8 && !saved; attempt += 1) {
        const code = createGiveCode();
        const record = {
          code,
          status: 'active',
          productId: product.id,
          productName: product.name,
          productSnapshot: {
            id: product.id,
            name: product.name,
            shortName: product.shortName,
            collectionId: product.collectionId,
            productType: product.productType,
            image: primaryImage(product)?.url || '',
            variants: eligibleVariants.map(({ id, fit, size, color, sku }) => ({ id, fit, size, color, sku }))
          },
          sourceSessionId: orderRef,
          purchaserEmail: '',
          createdAt: new Date().toISOString(),
          redeemedAt: null,
          redemptionId: null,
          cancelledAt: null,
          cancellationReason: null
        };
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
