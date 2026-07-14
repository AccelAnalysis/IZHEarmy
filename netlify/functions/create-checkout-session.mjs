import Stripe from 'stripe';
import { CATALOG, normalizeCart } from './_shared/catalog.mjs';
import { json, methodNotAllowed } from './_shared/http.mjs';

export default async (request) => {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  if (!process.env.STRIPE_SECRET_KEY) return json({ error: 'Checkout is not configured yet. Add STRIPE_SECRET_KEY in Netlify.' }, 503);

  try {
    const payload = await request.json();
    const cart = normalizeCart(payload.cart);
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const origin = new URL(request.url).origin;
    const siteUrl = (process.env.URL || process.env.SITE_URL || origin).replace(/\/$/, '');
    const shippingCents = Number.parseInt(process.env.IZHE_SHIPPING_CENTS || '695', 10);
    const metadataCart = JSON.stringify(cart);
    if (metadataCart.length > 500) throw new Error('The cart is too large for checkout.');

    const lineItems = cart.map((item) => {
      const product = CATALOG[item.productId];
      return {
        quantity: item.quantity,
        price_data: {
          currency: 'usd',
          unit_amount: product.unitAmount,
          product_data: {
            name: `${product.name} — Size ${item.size}`,
            description: `${product.color}. Includes one Give One claim per shirt.`,
            images: [product.image],
            metadata: { productId: product.id, sku: product.sku, size: item.size }
          }
        }
      };
    });

    const sessionConfig = {
      mode: 'payment',
      line_items: lineItems,
      success_url: `${siteUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/?checkout=cancelled#collection`,
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      shipping_address_collection: { allowed_countries: ['US'] },
      phone_number_collection: { enabled: true },
      customer_creation: 'always',
      invoice_creation: { enabled: true },
      metadata: { cart: metadataCart, source: 'izhe-website' },
      payment_intent_data: { metadata: { cart: metadataCart, source: 'izhe-website' } },
      custom_text: {
        submit: { message: 'Each shirt purchased creates one Give One claim code after payment.' },
        shipping_address: { message: 'Enter the shipping address for the shirts in this purchase.' }
      }
    };

    if (Number.isFinite(shippingCents) && shippingCents > 0) {
      sessionConfig.shipping_options = [{
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: shippingCents, currency: 'usd' },
          display_name: 'Standard shipping',
          delivery_estimate: { minimum: { unit: 'business_day', value: 5 }, maximum: { unit: 'business_day', value: 10 } }
        }
      }];
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);
    return json({ url: session.url });
  } catch (error) {
    console.error('create-checkout-session', error);
    return json({ error: error.message || 'Checkout could not be started.' }, 400);
  }
};
