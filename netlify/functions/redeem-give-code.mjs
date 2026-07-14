import { getStore } from '@netlify/blobs';
import { loadCatalog } from './_shared/catalog-service.mjs';
import { normalizeCode, createConfirmation } from './_shared/codes.mjs';
import { appendStatusHistory, effectiveCodeStatus } from './_shared/operations-rules.mjs';
import { json, methodNotAllowed, cleanText, requireFields } from './_shared/http.mjs';

function redemptionProduct(record, catalog) {
  const current = catalog.products.find((product) => product.id === record.productId);
  const snapshot = record.productSnapshot || {};
  return {
    id: current?.id || snapshot.id || record.productId,
    name: current?.name || snapshot.name || record.productName,
    variants: (current?.variants?.length ? current.variants : snapshot.variants || [])
      .filter((variant) => variant.status !== 'disabled' && !['retired', 'sold_out'].includes(variant.availabilityStatus))
  };
}

export default async (request) => {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  try {
    const payload = await request.json();
    requireFields(payload, ['code', 'size', 'firstName', 'lastName', 'email', 'address1', 'city', 'state', 'postalCode']);
    const code = normalizeCode(payload.code);
    if (!/^IZHE-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) return json({ error: 'Enter a valid IZHE claim code.' }, 400);
    const codes = getStore('izhe-give-codes');
    const current = await codes.getWithMetadata(code, { type: 'json', consistency: 'strong' });
    if (!current) return json({ error: 'This claim code was not found.' }, 404);
    const codeStatus = effectiveCodeStatus(current.data);
    if (codeStatus === 'expired') return json({ error: 'This claim code has expired. Contact IZHE support.' }, 409);
    if (codeStatus !== 'active') return json({ error: 'This claim code has already been redeemed, cancelled, or replaced.' }, 409);
    const { catalog } = await loadCatalog();
    const product = redemptionProduct(current.data, catalog);
    const fit = cleanText(payload.fit, 40);
    const size = cleanText(payload.size, 12).toUpperCase();
    const variantId = cleanText(payload.variantId, 80);
    const variant = product.variants.find((candidate) => candidate.id === variantId || ((!fit || candidate.fit.toLowerCase() === fit.toLowerCase()) && candidate.size.toUpperCase() === size));
    if (!variant) return json({ error: 'Select a valid available fit and size.' }, 400);
    const email = cleanText(payload.email, 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Enter a valid email address.' }, 400);
    const state = cleanText(payload.state, 2).toUpperCase();
    const postalCode = cleanText(payload.postalCode, 10);
    if (!/^[A-Z]{2}$/.test(state)) return json({ error: 'Enter a two-letter U.S. state abbreviation.' }, 400);
    if (!/^\d{5}(-\d{4})?$/.test(postalCode)) return json({ error: 'Enter a valid U.S. ZIP code.' }, 400);
    const confirmation = createConfirmation('GIVE');
    const now = new Date().toISOString();
    const redemption = {
      confirmation,
      code,
      productId: product.id,
      productName: product.name,
      variantId: variant.id,
      fit: variant.fit || '',
      size: variant.size,
      color: variant.color || '',
      variantSku: variant.sku || '',
      campaignId: current.data.campaignId || '',
      campaignSlug: current.data.campaignSlug || '',
      campaign: current.data.campaign || null,
      recipient: {
        firstName: cleanText(payload.firstName, 80),
        lastName: cleanText(payload.lastName, 80),
        email,
        address1: cleanText(payload.address1, 120),
        address2: cleanText(payload.address2, 120),
        city: cleanText(payload.city, 80),
        state,
        postalCode,
        country: 'US'
      },
      status: 'pending_fulfillment',
      statusHistory: appendStatusHistory({}, 'pending_fulfillment', 'Give One redemption submitted', 'recipient'),
      createdAt: now,
      updatedAt: now
    };
    const updatedCode = {
      ...current.data,
      status: 'redeemed',
      redeemedAt: now,
      updatedAt: now,
      redemptionId: confirmation,
      redeemedVariant: { id: variant.id, fit: variant.fit, size: variant.size, color: variant.color }
    };
    const updateResult = await codes.setJSON(code, updatedCode, { onlyIfMatch: current.etag });
    if (!updateResult.modified) return json({ error: 'This code was redeemed in another session. Refresh and try again.' }, 409);
    const redemptions = getStore('izhe-redemptions');
    await redemptions.setJSON(confirmation, redemption, { onlyIfNew: true });
    return json({ success: true, confirmation, status: redemption.status });
  } catch (error) {
    console.error('redeem-give-code', error);
    return json({ error: error.message || 'Redemption could not be completed.' }, 400);
  }
};
