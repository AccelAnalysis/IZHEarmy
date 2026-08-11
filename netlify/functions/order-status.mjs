import Stripe from 'stripe';
import { fulfillPaidSession } from './_shared/fulfill.mjs';
import { legacyFulfillmentSnapshot } from './_shared/fulfillment-rules.mjs';
import { json, methodNotAllowed } from './_shared/http.mjs';

export default async (request) => {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  if (!process.env.STRIPE_SECRET_KEY) return json({ error: 'Order lookup is not configured.' }, 503);
  const sessionId = new URL(request.url).searchParams.get('session_id');
  if (!sessionId || !sessionId.startsWith('cs_')) return json({ error: 'Invalid checkout session.' }, 400);
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY); const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid') return json({ paymentStatus: session.payment_status, status: session.status });
    const order = await fulfillPaidSession(stripe, session); const fulfillment = legacyFulfillmentSnapshot(order);
    return json({ paymentStatus: 'paid', customerEmail: order.customerEmail, amountSubtotal: order.amountSubtotal || 0, amountShipping: order.amountShipping || 0, amountTax: order.amountTax || 0, amountDiscount: order.amountDiscount || 0, amountTotal: order.amountTotal || 0, currency: order.currency, cart: order.cart, giveCodes: order.giveCodes, fulfillment: { mode: fulfillment.mode, campaignMethod: fulfillment.campaignMethod, pickupLocation: fulfillment.pickupLocation, publicInstructions: fulfillment.publicInstructions, estimatedReadyAt: fulfillment.estimatedReadyAt, pickupStartAt: fulfillment.pickupStartAt, pickupEndAt: fulfillment.pickupEndAt, status: fulfillment.status }, pickupCode: fulfillment.mode === 'church_batch' ? order.pickupCode || '' : '' }, 200, { 'cache-control': 'no-store' });
  } catch (error) { console.error('order-status', error); return json({ error: 'The order could not be located.' }, 404); }
};
