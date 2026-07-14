import { getStore } from '@netlify/blobs';
import { loadCatalog } from './catalog-service.mjs';
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

async function resolveDraft(session) {
  const draftId = session.metadata?.draftId || '';
  if (draftId) {
    const draft = await getStore('izhe-checkout-drafts').get(draftId, { type: 'json', consistency: 'strong' });
    if (draft?.items?.length) return { draftId, ...draft };
  }

  const legacyCart = JSON.parse(session.metadata?.cart || '[]');
  if (!legacyCart.length) return {
    draftId,
    cart: [],
    items: [],
    campaignId: session.metadata?.campaignId || '',
    campaignSlug: session.metadata?.campaignSlug || ''
  };
  const { catalog } = await loadCatalog();
  const products = new Map(catalog.products.map((product) => [product.id, product]));
  const items = legacyCart.map((item) => {
    const product = products.get(item.productId);
    if (!product) return null;
    const variant = product.variants?.find((candidate) => candidate.id === item.variantId || (candidate.fit === item.fit && candidate.size === item.size));
    return {
      productId: product.id,
      productName: product.name,
      shortName: product.shortName,
      productType: product.productType,
      collectionId: product.collectionId,
      sku: product.sku,
      unitAmount: product.unitAmount,
      currency: product.currency,
      giveOneEligible: product.giveOneEligible,
      giveOneUnitsPerPaidUnit: product.giveOneUnitsPerPaidUnit,
      variantId: variant?.id || '',
      fit: variant?.fit || item.fit || '',
      size: variant?.size || item.size || '',
      color: variant?.color || '',
      variantSku: variant?.sku || '',
      eligibleGiftVariants: (product.variants || []).map(({ id, fit, size, color, sku }) => ({ id, fit, size, color, sku })),
      quantity: item.quantity
    };
  }).filter(Boolean);
  return {
    draftId,
    cart: legacyCart,
    items,
    campaignId: session.metadata?.campaignId || '',
    campaignSlug: session.metadata?.campaignSlug || ''
  };
}

export async function fulfillPaidSession(stripe, session) {
  const orders = getStore('izhe-orders');
  const existing = await orders.get(session.id, { type: 'json', consistency: 'strong' });
  if (existing && existing.status !== 'processing') return existing;

  const lockKey = `lock-${session.id}`;
  const lock = await orders.setJSON(lockKey, { createdAt: Date.now() }, { onlyIfNew: true });
  if (!lock.modified) {
    const completed = await waitForOrder(orders, session.id);
    if (completed) return completed;
    throw new Error('Order fulfillment is already in progress.');
  }

  const generatedCodes = [];
  const codes = getStore('izhe-give-codes');
  try {
    const draft = await resolveDraft(session);
    const now = new Date().toISOString();
    await orders.setJSON(session.id, {
      status: 'processing',
      sessionId: session.id,
      cart: draft.cart,
      items: draft.items,
      campaignId: draft.campaignId || '',
      campaignSlug: draft.campaignSlug || '',
      campaign: draft.campaign || null,
      createdAt: now,
      updatedAt: now,
      statusHistory: [{ status: 'processing', at: now, actor: 'system', note: 'Stripe payment confirmation is being processed.' }]
    });

    for (const item of draft.items) {
      if (!item.giveOneEligible) continue;
      const codeCount = item.quantity * Math.max(1, Number(item.giveOneUnitsPerPaidUnit || 1));
      for (let index = 0; index < codeCount; index += 1) {
        let code;
        let saved = false;
        for (let attempt = 0; attempt < 8 && !saved; attempt += 1) {
          code = createGiveCode();
          const value = {
            code,
            status: 'active',
            productId: item.productId,
            productName: item.productName,
            productSnapshot: {
              id: item.productId,
              name: item.productName,
              shortName: item.shortName,
              collectionId: item.collectionId,
              productType: item.productType,
              variants: item.eligibleGiftVariants || []
            },
            campaignId: draft.campaignId || '',
            campaignSlug: draft.campaignSlug || '',
            campaign: draft.campaign || null,
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
        generatedCodes.push({
          code,
          productId: item.productId,
          productName: item.productName,
          campaignId: draft.campaignId || ''
        });
      }
    }

    const paidAt = new Date().toISOString();
    const order = {
      sessionId: session.id,
      paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || '',
      paymentStatus: session.payment_status,
      status: 'paid',
      customerEmail: session.customer_details?.email || session.customer_email || '',
      customerName: session.customer_details?.name || '',
      amountTotal: session.amount_total || 0,
      currency: session.currency || 'usd',
      shippingDetails: session.shipping_details || session.collected_information?.shipping_details || null,
      cart: draft.cart,
      items: draft.items,
      catalogRevision: draft.catalogRevision || Number(session.metadata?.catalogRevision || 0) || null,
      campaignId: draft.campaignId || session.metadata?.campaignId || '',
      campaignSlug: draft.campaignSlug || session.metadata?.campaignSlug || '',
      campaign: draft.campaign || null,
      giveCodes: generatedCodes,
      createdAt: paidAt,
      updatedAt: paidAt,
      statusHistory: [
        { status: 'processing', at: now, actor: 'system', note: 'Stripe payment confirmation is being processed.' },
        { status: 'paid', at: paidAt, actor: 'system', note: 'Stripe payment confirmed.' }
      ]
    };

    await orders.setJSON(session.id, order);
    if (draft.draftId) await getStore('izhe-checkout-drafts').delete(draft.draftId).catch(() => {});
    if (order.paymentIntentId) {
      const index = getStore('izhe-payment-index');
      await index.setJSON(order.paymentIntentId, { sessionId: session.id }, { onlyIfNew: true });
    }
    return order;
  } catch (error) {
    for (const generated of generatedCodes) {
      const entry = await codes.get(generated.code, { type: 'json', consistency: 'strong' }).catch(() => null);
      if (entry?.status === 'active' && entry.sourceSessionId === session.id) await codes.delete(generated.code).catch(() => {});
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
