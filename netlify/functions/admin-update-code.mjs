import { getStore } from '@netlify/blobs';
import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import { maskCode, sha256 } from './_shared/admin-crypto.mjs';
import { readJsonBody, requiredExplanation } from './_shared/admin-request.mjs';
import { loadCatalog, primaryImage } from './_shared/catalog-service.mjs';
import { createGiveCode, normalizeCode } from './_shared/codes.mjs';
import { cleanText, json } from './_shared/http.mjs';

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

export default adminEndpoint({
  methods: ['POST'],
  permission: 'operations.give_one.write',
  csrf: true,
  recentAuth: false,
  auditAction: 'give_one.code.update',
  rateClass: 'write',
  contentTypes: ['application/json'],
  maxBodyBytes: 100_000
}, async (request, context) => {
  const payload = await readJsonBody(request);
  const code = normalizeCode(payload.code);
  const action = cleanText(payload.action, 40);
  if (!code) throw Object.assign(new Error('A valid Give One code is required.'), { statusCode: 400 });
  const store = getStore('izhe-give-codes');
  const entry = await store.getWithMetadata(code, { type: 'json', consistency: 'strong' });
  if (!entry) throw Object.assign(new Error('Give One code not found.'), { statusCode: 404 });
  if (payload.expectedUpdatedAt && entry.data.updatedAt !== payload.expectedUpdatedAt) {
    throw Object.assign(new Error('This code changed in another session. Refresh and retry.'), { statusCode: 409 });
  }

  const now = new Date().toISOString();
  const note = cleanText(payload.note, 500);
  let reason = cleanText(payload.reason, 1_000);
  let updated = {
    ...entry.data,
    adminNote: note || entry.data.adminNote || '',
    updatedAt: now,
    lastAdministrativeActorId: context.userId
  };
  let replacement = null;

  if (action === 'cancel') {
    reason = requiredExplanation(reason);
    if (entry.data.status === 'redeemed') throw Object.assign(new Error('A redeemed code cannot be cancelled.'), { statusCode: 409 });
    updated = { ...updated, status: 'cancelled', cancelledAt: now, cancellationReason: reason };
  } else if (action === 'reactivate') {
    reason = requiredExplanation(reason);
    if (['redeemed', 'reissued'].includes(entry.data.status)) throw Object.assign(new Error('This code cannot be reactivated.'), { statusCode: 409 });
    updated = { ...updated, status: 'active', expiresAt: null, cancelledAt: null, cancellationReason: null, reactivationReason: reason };
  } else if (action === 'extend') {
    if (entry.data.status !== 'active') throw Object.assign(new Error('Only active codes can be extended.'), { statusCode: 409 });
    const expiresAt = payload.expiresAt ? new Date(payload.expiresAt) : null;
    if (!expiresAt || Number.isNaN(expiresAt.valueOf()) || expiresAt <= new Date()) {
      throw Object.assign(new Error('Choose a future expiration date.'), { statusCode: 400 });
    }
    updated = { ...updated, expiresAt: expiresAt.toISOString() };
  } else if (action === 'transfer') {
    reason = requiredExplanation(reason);
    if (entry.data.status !== 'active') throw Object.assign(new Error('Only active codes can be transferred.'), { statusCode: 409 });
    const { catalog } = await loadCatalog();
    const productId = cleanText(payload.productId, 80);
    const product = catalog.products.find((candidate) => candidate.id === productId && candidate.giveOneEligible && candidate.status !== 'archived');
    if (!product) throw Object.assign(new Error('Select a valid Give One eligible product.'), { statusCode: 400 });
    updated = {
      ...updated,
      productId: product.id,
      productName: product.name,
      productSnapshot: productSnapshot(product),
      transferredAt: now,
      transferReason: reason
    };
  } else if (action === 'reissue') {
    reason = requiredExplanation(reason);
    if (entry.data.status === 'redeemed') throw Object.assign(new Error('A redeemed code cannot be reissued.'), { statusCode: 409 });
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
      reissueReason: reason,
      adminNote: note,
      createdByAdministratorId: context.userId,
      lastAdministrativeActorId: context.userId
    };
    const saved = await store.setJSON(replacementCode, replacement, { onlyIfNew: true });
    if (!saved.modified) throw new Error('The replacement code could not be saved.');
    updated = { ...updated, status: 'reissued', reissuedAt: now, replacementCode };
  } else if (action === 'note') {
    if (!note) throw Object.assign(new Error('Enter an administrative note.'), { statusCode: 400 });
  } else {
    throw Object.assign(new Error('Unsupported Give One action.'), { statusCode: 400 });
  }

  const result = await store.setJSON(code, updated, { onlyIfMatch: entry.etag });
  if (!result.modified) {
    if (replacement) await store.delete(replacement.code).catch(() => {});
    throw Object.assign(new Error('This code changed in another session. Refresh and retry.'), { statusCode: 409 });
  }
  return {
    response: json({ updated, replacement }),
    audit: {
      resourceType: 'give_one_code',
      resourceId: `code_${sha256(code).slice(0, 20)}`,
      reason: reason || note,
      beforeSummary: {
        code: maskCode(code),
        status: entry.data.status,
        productId: entry.data.productId,
        expiresAt: entry.data.expiresAt || null
      },
      afterSummary: {
        code: maskCode(code),
        action,
        status: updated.status,
        productId: updated.productId,
        expiresAt: updated.expiresAt || null,
        replacementCreated: Boolean(replacement)
      }
    }
  };
});
