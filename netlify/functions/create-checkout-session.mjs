import { randomUUID } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import Stripe from 'stripe';
import { CATALOG, normalizeCart } from './_shared/catalog.mjs';
import { json, methodNotAllowed } from './_shared/http.mjs';

async function resolvePrices(stripe, cart) {
  const lookupKeys = [...new Set(cart.map((item) => CATALOG[item.productId].lookupKey))];
  const prices = [];

  for (let index = 0; index < lookupKeys.length; index += 10) {
    const batch = lookupKeys.slice(index, index + 10);
    const response = await stripe.prices.list({ active: true, lookup_keys: batch, limit: 100 });
    prices.push(...response.data);
  }

  const byLookupKey = new Map(prices.map((price) => [price.lookup_key, price]));
  for (const item of cart) {
    const product = CATALOG[item.productId];
    const price = byLookupKey.get(product.lookupKey);
    if (!price) throw new Error(`Stripe price ${product.lookupKey} is unavailable.`);
    if (price.currency !== 'usd' || price.unit_amount !== product.unitAmount) {
      throw new Error(`Stripe price ${product.lookupKey} does not match the approved IZHE catalog.`);
    }
  }
  return byLookupKey;
}

export default async (request) => {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  if (!process.env.STRIPE_SECRET_KEY) {
    return json({ error: 'Checkout is not configured yet. Add STRIPE_SECRET_KEY in Netlify.' }, 503);
  }

  let draftId = '';
  try {
    const payload = await request.json();
    const cart = normalizeCart(payload.cart);
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const prices = await resolvePrices(stripe, cart);
    const origin = new URL(request.url).origin;
    const siteUrl = (process.env.URL || process.env.SITE_URL || origin).replace(/\/$/, '');
    const shippingCents = Number.parseInt(process.env.IZHE_SHIPPING_CENTS || '699', 10);
    const shippingRateId = String(process.env.STRIPE_STANDARD_SHIPPING_RATE_ID || '').trim();

    draftId = randomUUID();
    const drafts = getStore('izhe-checkout-drafts');
    await drafts.setJSON(draftId, {
      cart,
      status: 'created',
      createdAt: new Date().toISOString()
    }, { onlyIfNew: true });

    const lineItems = cart.map((item) => ({
      quantity: item.quantity,
      price: prices.get(CATALOG[item.productId].lookupKey).id
    }));

    const hasGiveOneItems = cart.some((item) => CATALOG[item.productId].giveOneEligible);
    const sessionConfig = {
      mode: 'payment',
      line_items: lineItems,
      success_url: `${siteUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/?checkout=cancelled#collection`,
      automatic_tax: { enabled: true },
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      shipping_address_collection: { allowed_countries: ['US'] },
      phone_number_collection: { enabled: true },
      customer_creation: 'always',
      invoice_creation: { enabled: true },
      metadata: { draftId, source: 'izhe-website' },
      payment_intent_data: { metadata: { draftId, source: 'izhe-website' } },
      custom_text: {
        submit: {
          message: hasGiveOneItems
            ? 'Each eligible shirt purchased creates one Give One claim code after payment.'
            : 'Your order will be prepared after payment is confirmed.'
        },
        shipping_address: { message: 'Enter the U.S. address where this order should be shipped.' }
      }
    };

    if (shippingRateId) {
      sessionConfig.shipping_options = [{ shipping_rate: shippingRateId }];
    } else if (Number.isFinite(shippingCents) && shippingCents > 0) {
      sessionConfig.shipping_options = [{
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: shippingCents, currency: 'usd' },
          display_name: 'Standard U.S. shipping',
          tax_behavior: 'exclusive',
          delivery_estimate: {
            minimum: { unit: 'business_day', value: 5 },
            maximum: { unit: 'business_day', value: 10 }
          }
        }
      }];
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);
    await drafts.setJSON(draftId, {
      cart,
      status: 'checkout_created',
      sessionId: session.id,
      createdAt: new Date().toISOString()
    });
    return json({ url: session.url });
  } catch (error) {
    if (draftId) {
      const drafts = getStore('izhe-checkout-drafts');
      await drafts.delete(draftId).catch(() => {});
    }
    console.error('create-checkout-session', error);
    return json({ error: error.message || 'Checkout could not be started.' }, 400);
  }
};
