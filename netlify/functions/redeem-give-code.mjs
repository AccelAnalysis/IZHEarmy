import { getStore } from '@netlify/blobs';
import { CATALOG } from './_shared/catalog.mjs';
import { normalizeCode, createConfirmation } from './_shared/codes.mjs';
import { json, methodNotAllowed, cleanText, requireFields } from './_shared/http.mjs';

export default async (request) => {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  try {
    const payload = await request.json();
    requireFields(payload, ['code', 'fit', 'size', 'firstName', 'lastName', 'email', 'address1', 'city', 'state', 'postalCode']);
    const code = normalizeCode(payload.code);
    if (!/^IZHE-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) return json({ error: 'Enter a valid IZHE claim code.' }, 400);

    const codes = getStore('izhe-give-codes');
    const current = await codes.getWithMetadata(code, { type: 'json', consistency: 'strong' });
    if (!current) return json({ error: 'This claim code was not found.' }, 404);
    if (current.data.status !== 'active') return json({ error: 'This claim code has already been redeemed.' }, 409);

    const product = CATALOG[current.data.productId];
    const fitInput = cleanText(payload.fit, 20);
    const fit = product?.fits.find((candidate) => candidate.toLowerCase() === fitInput.toLowerCase());
    const size = cleanText(payload.size, 5).toUpperCase();
    if (!product?.giveOneEligible || !fit) return json({ error: 'Select a valid available fit.' }, 400);
    if (!product.sizes.includes(size)) return json({ error: 'Select a valid available size.' }, 400);

    const email = cleanText(payload.email, 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Enter a valid email address.' }, 400);
    const state = cleanText(payload.state, 2).toUpperCase();
    const postalCode = cleanText(payload.postalCode, 10);
    if (!/^[A-Z]{2}$/.test(state)) return json({ error: 'Enter a two-letter U.S. state abbreviation.' }, 400);
    if (!/^\d{5}(-\d{4})?$/.test(postalCode)) return json({ error: 'Enter a valid U.S. ZIP code.' }, 400);

    const confirmation = createConfirmation('GIVE');
    const redemption = {
      confirmation,
      code,
      productId: product.id,
      productName: product.name,
      fit,
      size,
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
      createdAt: new Date().toISOString()
    };

    const updatedCode = { ...current.data, status: 'redeemed', redeemedAt: redemption.createdAt, redemptionId: confirmation };
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
