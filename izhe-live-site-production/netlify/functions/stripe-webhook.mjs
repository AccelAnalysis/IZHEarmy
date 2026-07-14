import Stripe from 'stripe';
import { fulfillPaidSession, cancelUnusedGiveCodes } from './_shared/fulfill.mjs';

export default async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) return new Response('Webhook is not configured', { status: 503 });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const signature = request.headers.get('stripe-signature');
  const rawBody = await request.text();

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    console.error('stripe-webhook signature', error);
    return new Response(`Webhook signature verification failed: ${error.message}`, { status: 400 });
  }

  try {
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object;
      if (session.payment_status === 'paid' || event.type === 'checkout.session.async_payment_succeeded') await fulfillPaidSession(stripe, session);
    }
    if (event.type === 'charge.refunded') {
      await cancelUnusedGiveCodes(event.data.object.payment_intent, 'charge_refunded');
    }
    if (event.type === 'charge.dispute.created') {
      await cancelUnusedGiveCodes(event.data.object.payment_intent, 'charge_disputed');
    }
    return new Response('ok');
  } catch (error) {
    console.error('stripe-webhook processing', error);
    return new Response('Webhook processing failed', { status: 500 });
  }
};
