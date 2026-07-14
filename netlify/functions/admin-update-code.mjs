import { getStore } from '@netlify/blobs';
import { requireAdmin } from './_shared/admin-auth.mjs';
import { loadCatalog, primaryImage } from './_shared/catalog-service.mjs';
import { createGiveCode, normalizeCode } from './_shared/codes.mjs';
import { cleanText, json, methodNotAllowed } from './_shared/http.mjs';

async function uniqueCode(store) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = createGiveCode();
    const exists = await store.get(code, { type: 'json', consistency: 'strong' });
    if (!exists) return code;
  }
  throw new Error('A replacement code could not be generated.');
}

function productSnapshot(product) {
  return {
    id: product.id,
    name: product.name,
    shortName: product.shortName,
    collectionId: product.collectionId,
    productType: product.productType,
    image: primaryImage(product)?.url || '',
    variants: (product.variants || [])
      .filter((variant) => variant.status !== 'disabled' && !['retired', 'sold_out'].includes(variant.availabilityStatus))
      .map(({ id, fit, size, color, sku }) => ({ id, fit, size, color, sku }))
  };
}

export default async (request) => {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const payload = await request.json();
    const code = normalizeCode(payload.code);
    const action = cleanText(payload.action, 40);
    const store = getStore('izhe-give-codes');
    const entry = await store.getWithMetadata(code, { type: 'json', consistency: 'strong' });
    if (!entry) return json({ error: 'Give One code not found.' }, 404);
    const now = new Date().toISOString();
    const note = cleanText(payload.note, 500);
    let updated = { ...entry.data, adminNote: note || entry.data.adminNote || '', updatedAt: now };
    let replacement = null;

    if (action === 'cancel') {
      if (entry.data.status === 'redeemed') return json({ error: 'A redeemed code cannot be cancelled.' }, 409);
      updated = { ...updated, status: 'cancelled', cancelledAt: now, cancellationReason: cleanText(payload.reason, 240) || 'Cancelled by administrator' };
    } else if (action === 'reactivate') {
      if (['redeemed', 'reissued'].includes(entry.data.status)) return json({ error: 'This code cannot be reactivated.' }, 409);
      updated = { ...updated, status: 'active', expiresAt: null, cancelledAt: null, cancellationReason: null };
    } else if (action === 'extend') {
      if (entry.data.status !== 'active') return json({ error: 'Only active codes can be extended.' }, 409);
      const expiresAt = payload.expiresAt ? new Date(payload.expiresAt) : null;
      if (!expiresAt || Number.isNaN(expiresAt.valueOf()) || expiresAt <= new Date()) return json({ error: 'Choose a future expiration date.' }, 400);
      updated = { ...updated, expiresAt: expiresAt.toISOString() };
    } else if (action === 'transfer') {
      if (entry.data.status !== 'active') return json({ error: 'Only active codes can be transferred.' }, 409);
      const { catalog } = await loadCatalog();
      const productId = cleanText(payload.productId, 80);
      const product = catalog.products.find((candidate) => candidate.id === productId && candidate.giveOneEligible && candidate.status !== 'archived');
      if (!product) return json({ error: 'Select a valid Give One eligible product.' }, 400);
      updated = {
        ...updated,
        productId: product.id,
        productName: product.name,
        productSnapshot: productSnapshot(product),
        transferredAt: now,
        transferReason: cleanText(payload.reason, 240)
      };
    } else if (action === 'reissue') {
      if (entry.data.status === 'redeemed') return json({ error: 'A redeemed code cannot be reissued.' }, 409);
      const replacementCode = await uniqueCode(store);
      replacement = {
        ...entry.data,
        code: replacementCode,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        redeemedAt: null,
        redemptionId: null,
        expiresAt: null,
        cancelledAt: null,
        cancellationReason: null,
        replacementFor: code,
        reissueReason: cleanText(payload.reason, 240),
        adminNote: note
      };
      const saved = await store.setJSON(replacementCode, replacement, { onlyIfNew: true });
      if (!saved.modified) throw new Error('The replacement code could not be saved.');
      updated = { ...updated, status: 'reissued', reissuedAt: now, replacementCode };
    } else if (action === 'note') {
      // note-only update
    } else {
      return json({ error: 'Unsupported Give One action.' }, 400);
    }

    const result = await store.setJSON(code, updated, { onlyIfMatch: entry.etag });
    if (!result.modified) {
      if (replacement) await store.delete(replacement.code).catch(() => {});
      return json({ error: 'This code changed in another session. Refresh and retry.' }, 409);
    }
    return json({ updated, replacement });
  } catch (error) {
    console.error('admin-update-code', error);
    return json({ error: error.message || 'Give One code could not be updated.' }, 400);
  }
};
