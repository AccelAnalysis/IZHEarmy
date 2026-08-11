import { getStore } from '@netlify/blobs';
import Stripe from 'stripe';
import { fulfillPaidSession } from './_shared/fulfill.mjs';
import { processDisputeEvent, processRefundEvent } from './_shared/payment-event-service.mjs';
import { markPaymentEventOnOrder } from './_shared/payment-service.mjs';
import {
  beginStripeEventReceipt,
  completeStripeEvent,
  failStripeEvent,
  linkStripeEventOrder,
  updateStripeEventStage
} from './_shared/stripe-event-service.mjs';

const REFUND_EVENTS = new Set([
  'charge.refunded',
  'refund.created',
  'refund.updated',
  'refund.failed'
]);

const DISPUTE_EVENTS = new Set([
  'charge.dispute.created',
  'charge.dispute.updated',
  'charge.dispute.closed',
  'charge.dispute.funds_reinstated',
  'charge.dispute.funds_withdrawn'
]);

async function deleteCheckoutDraft(session) {
  const draftId = session?.metadata?.draftId;
  if (!draftId) return;
  await getStore('izhe-checkout-drafts').delete(draftId).catch(() => {});
}

function eventCreatedAt(event) {
  return Number.isFinite(Number(event?.created)) ? new Date(Number(event.created) * 1000).toISOString() : new Date().toISOString();
}

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
    console.error('stripe-webhook signature verification failed', String(error?.message || 'invalid signature').slice(0, 300));
    return new Response('Webhook signature verification failed', { status: 400 });
  }

  let receipt;
  try {
    const begun = await beginStripeEventReceipt(event, rawBody);
    receipt = begun.receipt;
    if (begun.alreadyProcessed) return new Response('ok');
  } catch (error) {
    console.error('stripe-webhook receipt persistence failed', String(error?.message || error).slice(0, 300));
    return new Response('Webhook receipt persistence failed', { status: 500 });
  }

  try {
    const createdAt = eventCreatedAt(event);
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      await updateStripeEventStage(event.id, 'payment_verified');
      const session = event.data.object;
      if (session.payment_status === 'paid' || event.type === 'checkout.session.async_payment_succeeded') {
        const order = await fulfillPaidSession(stripe, session, { eventId: event.id, eventCreatedAt: createdAt });
        await linkStripeEventOrder(event.id, order.sessionId, {
          checkoutSessionId: order.sessionId,
          paymentIntentId: order.payment?.paymentIntentId || order.paymentIntentId || ''
        });
        await markPaymentEventOnOrder(order.sessionId, event.id, createdAt).catch(() => null);
      }
      await completeStripeEvent(event.id, { reconciliationState: session.payment_status === 'paid' || event.type === 'checkout.session.async_payment_succeeded' ? 'reconciled' : 'awaiting_payment' });
      return new Response('ok');
    }

    if (event.type === 'checkout.session.async_payment_failed' || event.type === 'checkout.session.expired') {
      await updateStripeEventStage(event.id, 'checkout_closed_without_payment');
      await deleteCheckoutDraft(event.data.object);
      await completeStripeEvent(event.id, { reconciliationState: 'reconciled' });
      return new Response('ok');
    }

    if (REFUND_EVENTS.has(event.type)) {
      await updateStripeEventStage(event.id, 'refund_reconciliation');
      const result = await processRefundEvent(stripe, event);
      await linkStripeEventOrder(event.id, result.sessionId);
      await markPaymentEventOnOrder(result.sessionId, event.id, createdAt).catch(() => null);
      await completeStripeEvent(event.id, { reconciliationState: result.reconciliationStatus || 'reconciled' });
      return new Response('ok');
    }

    if (DISPUTE_EVENTS.has(event.type)) {
      await updateStripeEventStage(event.id, 'dispute_reconciliation');
      const result = await processDisputeEvent(stripe, event);
      await linkStripeEventOrder(event.id, result.sessionId);
      await markPaymentEventOnOrder(result.sessionId, event.id, createdAt).catch(() => null);
      await completeStripeEvent(event.id, { reconciliationState: result.reconciliationStatus || 'reconciled' });
      return new Response('ok');
    }

    await completeStripeEvent(event.id, {
      processingState: 'ignored_supported_noop',
      reconciliationState: 'not_applicable',
      fields: { ignoredEventType: event.type }
    });
    return new Response('ok');
  } catch (error) {
    const reconciliationRequired = Boolean(error?.reconciliationRequired || error?.code === 'stripe_event_unmatched');
    await failStripeEvent(event.id, error, { reconciliationRequired }).catch(() => null);
    console.error('stripe-webhook processing failed', {
      eventId: event.id,
      eventType: event.type,
      code: String(error?.code || error?.name || 'processing_failed').slice(0, 120),
      message: String(error?.message || 'Stripe event processing failed').slice(0, 300)
    });
    return new Response(reconciliationRequired ? 'Webhook reconciliation required' : 'Webhook processing failed', { status: 500 });
  }
};
