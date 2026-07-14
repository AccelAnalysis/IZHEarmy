import { getStore } from '@netlify/blobs';
import { CATALOG } from './catalog.mjs';
import { createGiveCode } from './codes.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForOrder(orders, sessionId) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const order = await orders.get(sessionId, { type: 'json', consistency: 'strong' });
    if (order?.status !== 'processing') return order;
    await sleep(250);
  }
  return null;
}

async function loadCheckoutCart(session) {
  const draftId = session.metadata?.draftId || '';
  if (draftId) {
    const drafts = getStore('izhe-checkout-drafts');
    const draft = await drafts.get(draftId, { type: 'json', consistency: 'strong' });
    if (!draft?.cart) throw new Error('The checkout cart record could not be found.');
    return { cart: draft.cart, draftId, drafts };
  }

  const cart = JSON.parse(session.metadata?.cart || '[]');
  return { cart, draftId: '', drafts: null };
}

export async function fulfillPaidSession(stripe, session) {
  const orders = getStore('izhe-orders');
  const existing = await orders.get(session.id, { type: 'json', consistency: 'strong' });
  if (existing?.status !== 'processing') return existing;

  const lockKey = `lock-${session.id}`;
  const lock = await orders.setJSON(lockKey, { createdAt: Date.now() }, { onlyIfNew: true });
  if (!lock.modified) {
    const completed = await waitForOrder(orders, session.id);
    if (completed) return completed;
    throw new Error('Order fulfillment is already in progress.');
  }

  const generatedCodes = [];
  const codes = getStore('izhe-give-codes');
  let draftId = '';
  let drafts = null;
  try {
    const checkout = await loadCheckoutCart(session);
    const cart = checkout.cart;
    draftId = checkout.draftId;
    drafts = checkout.drafts;

    await orders.setJSON(session.id, {
      status: 'processing',
      sessionId: session.id,
      draftId,
      cart,
      createdAt: new Date().toISOString()
    });

    for (const item of cart) {
      const product = CATALOG[item.productId];
      if (!product?.giveOneEligible) continue;
      const giveOneCount = item.quantity * (product.giveOneUnitsPerPaidUnit || 1);

      for (let index = 0; index < giveOneCount; index += 1) {
        let code;
        let saved = false;
        for (let attempt = 0; attempt < 8 && !saved; attempt += 1) {
          code = createGiveCode();
          const value = {
            code,
            status: 'active',
            productId: product.id,
            productName: product.name,
            sourceSessionId: session.id,
            purchaserEmail: session.customer_details?.email || session.customer_email || '',
            createdAt: new Date().toISOString(),
            redeemedAt: null,
            redemptionId: null,
            cancelledAt: null,
            cancellationReason: null
          };
          const result = await codes.setJSON(code, value, { onlyIfNew: true });
          saved = result.modified;
        }
        if (!saved) throw new Error('Unable to generate a unique Give One code.');
        generatedCodes.push({ code, productId: product.id, productName: product.name });
      }
    }

    const order = {
      sessionId: session.id,
      draftId,
      paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || '',
      paymentStatus: session.payment_status,
      status: 'paid',
      customerEmail: session.customer_details?.email || session.customer_email || '',
      customerName: session.customer_details?.name || '',
      amountSubtotal: session.amount_subtotal || 0,
      amountShipping: session.shipping_cost?.amount_total || 0,
      amountTax: session.total_details?.amount_tax || 0,
      amountTotal: session.amount_total || 0,
      currency: session.currency || 'usd',
      shippingDetails: session.shipping_details || session.collected_information?.shipping_details || null,
      cart,
      giveCodes: generatedCodes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await orders.setJSON(session.id, order);
    if (order.paymentIntentId) {
      const index = getStore('izhe-payment-index');
      await index.setJSON(order.paymentIntentId, { sessionId: session.id }, { onlyIfNew: true });
    }
    if (draftId && drafts) await drafts.delete(draftId).catch(() => {});
    return order;
  } catch (error) {
    for (const generated of generatedCodes) {
      const entry = await codes.get(generated.code, { type: 'json', consistency: 'strong' }).catch(() => null);
      if (entry?.status === 'active' && entry.sourceSessionId === session.id) {
        await codes.delete(generated.code).catch(() => {});
      }
    }
    await orders.delete(session.id).catch(() => {});
    throw error;
  } finally {
    await orders.delete(lockKey).catch(() => {});
  }
}

export async function cancelUnusedGiveCodes(paymentIntentId, reason) {
  if (!paymentIntentId) return null;
  const index = getStore('izhe-payment-index');
  const pointer = await index.get(paymentIntentId, { type: 'json', consistency: 'strong' });
  if (!pointer?.sessionId) return null;

  const orders = getStore('izhe-orders');
  const orderEntry = await orders.getWithMetadata(pointer.sessionId, { type: 'json', consistency: 'strong' });
  if (!orderEntry) return null;
  const codes = getStore('izhe-give-codes');
  let cancelled = 0;
  let alreadyRedeemed = 0;

  for (const item of orderEntry.data.giveCodes || []) {
    const codeEntry = await codes.getWithMetadata(item.code, { type: 'json', consistency: 'strong' });
    if (!codeEntry) continue;
    if (codeEntry.data.status === 'active') {
      const result = await codes.setJSON(item.code, {
        ...codeEntry.data,
        status: 'cancelled',
        cancelledAt: new Date().toISOString(),
        cancellationReason: reason
      }, { onlyIfMatch: codeEntry.etag });
      if (result.modified) cancelled += 1;
    } else if (codeEntry.data.status === 'redeemed') {
      alreadyRedeemed += 1;
    }
  }

  const updatedOrder = {
    ...orderEntry.data,
    status: alreadyRedeemed ? 'refund_requires_review' : 'refunded_or_disputed',
    cancellationReason: reason,
    cancelledCodes: cancelled,
    redeemedCodesAtCancellation: alreadyRedeemed,
    updatedAt: new Date().toISOString()
  };
  await orders.setJSON(pointer.sessionId, updatedOrder, { onlyIfMatch: orderEntry.etag });
  return updatedOrder;
}
