import { getStore } from '@netlify/blobs';
import { loadCatalog } from './catalog-service.mjs';
import { checkoutSessionTotals, legacyFulfillmentSnapshot, stablePickupCode } from './fulfillment-rules.mjs';
import { buildLineSettlements, canonicalPaymentFromCheckout, supportForOrder } from './payment-rules.mjs';
import { acquireOrderWorkflow, completeOrderWorkflow, failOrderWorkflow, updateOrderWorkflow } from './order-workflow-service.mjs';
import { ensureGiveOneObligations } from './give-one-service.mjs';
import { createReconciliationTask, ensurePaymentIndexes, proposeStripeReconciliation, retrieveStripePaymentFacts } from './payment-service.mjs';

async function resolveDraft(session, existingOrder = null) {
  const draftId = session.metadata?.draftId || existingOrder?.checkoutDraftId || '';
  if (draftId) {
    const draft = await getStore('izhe-checkout-drafts').get(draftId, { type: 'json', consistency: 'strong' });
    if (draft?.items?.length) return { draftId, ...draft };
  }
  if (existingOrder?.items?.length) {
    return {
      draftId,
      cart: existingOrder.cart || [],
      items: existingOrder.items,
      catalogRevision: existingOrder.catalogRevision || null,
      campaignId: existingOrder.campaignId || '',
      campaignSlug: existingOrder.campaignSlug || '',
      campaign: existingOrder.campaign || null,
      supportPolicy: existingOrder.supportPolicy || null,
      fulfillment: existingOrder.fulfillment || legacyFulfillmentSnapshot({ campaignId: existingOrder.campaignId, campaign: existingOrder.campaign }),
      pickupCode: existingOrder.pickupCode || ''
    };
  }
  const legacyCart = JSON.parse(session.metadata?.cart || '[]');
  if (!legacyCart.length) {
    return {
      draftId,
      cart: [],
      items: [],
      campaignId: session.metadata?.campaignId || '',
      campaignSlug: session.metadata?.campaignSlug || '',
      campaign: null,
      supportPolicy: null,
      fulfillment: { ...legacyFulfillmentSnapshot({}), source: session.metadata?.campaignId ? 'campaign' : 'general_storefront' }
    };
  }
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
      supportEligible: Boolean(product.supportEligible),
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
    campaignSlug: session.metadata?.campaignSlug || '',
    campaign: null,
    supportPolicy: null,
    fulfillment: { ...legacyFulfillmentSnapshot({}), source: session.metadata?.campaignId ? 'campaign' : 'general_storefront' }
  };
}

async function saveOrder(sessionId, transform) {
  const store = getStore('izhe-orders');
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await store.getWithMetadata(sessionId, { type: 'json', consistency: 'strong' });
    const next = transform(current?.data || null);
    const result = current?.data
      ? await store.setJSON(sessionId, next, { onlyIfMatch: current.etag })
      : await store.setJSON(sessionId, next, { onlyIfNew: true });
    if (result.modified) return next;
  }
  throw Object.assign(new Error('Order changed concurrently while payment fulfillment was being persisted.'), { code: 'order_write_conflict', retryable: true });
}

export async function fulfillPaidSession(stripe, incomingSession, { eventId = '', eventCreatedAt = '' } = {}) {
  const orders = getStore('izhe-orders');
  const sessionId = incomingSession?.id;
  if (!sessionId) throw Object.assign(new Error('Paid Checkout event is missing its Session ID.'), { code: 'missing_session_id' });
  const workflow = await acquireOrderWorkflow(sessionId, { eventId });
  const owner = workflow.ownerAttemptId;
  try {
    await updateOrderWorkflow(sessionId, owner, 'payment_verified');
    const facts = await retrieveStripePaymentFacts(stripe, { sessionId, paymentIntentId: typeof incomingSession.payment_intent === 'string' ? incomingSession.payment_intent : incomingSession.payment_intent?.id || '' });
    const session = facts.session || incomingSession;
    if (session.payment_status !== 'paid') throw Object.assign(new Error('Checkout Session is not in a paid state.'), { code: 'payment_not_paid' });
    await updateOrderWorkflow(sessionId, owner, 'payment_verified', { completed: true });

    const existing = await orders.get(sessionId, { type: 'json', consistency: 'strong' });
    const draft = await resolveDraft(session, existing);
    if (!draft.items?.length) throw Object.assign(new Error('The authoritative checkout item snapshot is unavailable.'), { code: 'checkout_snapshot_missing', reconciliationRequired: true });
    await updateOrderWorkflow(sessionId, owner, 'checkout_draft_resolved', { completed: true });

    const fulfillment = draft.fulfillment || existing?.fulfillment || legacyFulfillmentSnapshot({ campaignId: draft.campaignId, campaign: draft.campaign });
    const churchPickup = fulfillment.mode === 'church_batch';
    const pickupCode = churchPickup ? stablePickupCode(draft.pickupCode || existing?.pickupCode || '') : '';
    const initializedAt = new Date().toISOString();
    const initialized = await saveOrder(sessionId, (current) => {
      if (current) return {
        ...current,
        checkoutDraftId: current.checkoutDraftId || draft.draftId || '',
        commerceStatus: current.commerceStatus || 'confirmed',
        items: current.items?.length ? current.items : draft.items,
        cart: current.cart?.length ? current.cart : draft.cart,
        campaignId: current.campaignId || draft.campaignId || '',
        campaignSlug: current.campaignSlug || draft.campaignSlug || '',
        campaign: current.campaign || draft.campaign || null,
        supportPolicy: current.supportPolicy || draft.supportPolicy || null,
        fulfillment: current.fulfillment || { ...fulfillment, status: churchPickup ? 'awaiting_batch' : 'processing' },
        pickupCode: current.pickupCode || pickupCode,
        updatedAt: initializedAt
      };
      return {
        sessionId,
        checkoutDraftId: draft.draftId || '',
        commerceStatus: 'confirmed',
        paymentStatus: 'paid',
        status: 'processing',
        cart: draft.cart || [],
        items: draft.items,
        catalogRevision: draft.catalogRevision || Number(session.metadata?.catalogRevision || 0) || null,
        campaignId: draft.campaignId || session.metadata?.campaignId || '',
        campaignSlug: draft.campaignSlug || session.metadata?.campaignSlug || '',
        campaign: draft.campaign || null,
        supportPolicy: draft.supportPolicy || null,
        fulfillment: { ...fulfillment, status: churchPickup ? 'awaiting_batch' : 'processing' },
        pickupCode,
        createdAt: initializedAt,
        updatedAt: initializedAt,
        statusHistory: [{ status: 'processing', at: initializedAt, actor: 'system', note: 'Stripe payment confirmation is being processed.' }]
      };
    });
    await updateOrderWorkflow(sessionId, owner, 'order_initialized', { completed: true });

    const discountTotal = Math.max(0, Number(session.total_details?.amount_discount || 0));
    const lineSettlements = buildLineSettlements({ sessionId, draftItems: initialized.items, stripeLineItems: facts.lineItems, orderDiscountTotal: discountTotal });
    let payment = canonicalPaymentFromCheckout({ session, lines: lineSettlements, chargeIds: facts.chargeIds, paidAt: initialized.payment?.paidAt || initialized.createdAt || initializedAt, reconciliationStatus: 'reconciled' });
    payment.amounts.processorFee = facts.processorFee;
    payment.amounts.verifiedNetDeposit = facts.verifiedNetDeposit;
    const withSettlement = await saveOrder(sessionId, (current) => ({
      ...current,
      lineSettlements,
      payment,
      paymentIntentId: payment.paymentIntentId,
      paymentStatus: 'paid',
      amountSubtotal: payment.amounts.merchandiseGross,
      amountShipping: payment.amounts.shippingCollected,
      amountTax: payment.amounts.taxCollected,
      amountDiscount: payment.amounts.discountTotal,
      amountTotal: payment.amounts.totalCharged,
      currency: payment.currency,
      updatedAt: new Date().toISOString()
    }));
    await updateOrderWorkflow(sessionId, owner, 'line_settlement_saved', { completed: true });

    const obligations = await ensureGiveOneObligations({
      sessionId,
      paymentIntentId: payment.paymentIntentId,
      orderId: sessionId,
      items: withSettlement.items,
      lineSettlements,
      campaignId: withSettlement.campaignId || '',
      campaignSlug: withSettlement.campaignSlug || '',
      campaign: withSettlement.campaign || null,
      purchaserEmail: session.customer_details?.email || session.customer_email || withSettlement.customerEmail || '',
      legacyCodes: withSettlement.giveCodes || [],
      entitlementPolicyVersion: 'give-one-v1'
    });
    await updateOrderWorkflow(sessionId, owner, 'give_one_obligations_ensured', { completed: true, fields: { obligationCount: obligations.length } });

    const paidAt = payment.paidAt || new Date().toISOString();
    const totals = checkoutSessionTotals(session, fulfillment.mode);
    const finalized = await saveOrder(sessionId, (current) => {
      const existingFulfillment = current.fulfillment || fulfillment;
      const rootStatus = current.status && current.status !== 'processing' ? current.status : 'paid';
      const fulfillmentStatus = existingFulfillment.status && existingFulfillment.status !== 'processing'
        ? existingFulfillment.status
        : (churchPickup ? 'awaiting_batch' : 'paid');
      const giveCodes = obligations.map((obligation) => ({ code: obligation.publicClaimCode, obligationId: obligation.obligationId, productId: obligation.productId, productName: obligation.productSnapshot?.name || '', campaignId: obligation.campaignId || '' }));
      const history = Array.isArray(current.statusHistory) ? current.statusHistory : [];
      const alreadyPaid = history.some((entry) => entry.status === 'paid');
      return {
        ...current,
        sessionId,
        checkoutDraftId: current.checkoutDraftId || draft.draftId || '',
        paymentIntentId: payment.paymentIntentId,
        paymentStatus: 'paid',
        commerceStatus: 'confirmed',
        status: rootStatus,
        customerEmail: current.customerEmail || session.customer_details?.email || session.customer_email || '',
        customerName: current.customerName || session.customer_details?.name || '',
        customerPhone: current.customerPhone || session.customer_details?.phone || '',
        ...totals,
        amountSubtotal: payment.amounts.merchandiseGross,
        amountShipping: payment.amounts.shippingCollected,
        amountTax: payment.amounts.taxCollected,
        amountDiscount: payment.amounts.discountTotal,
        amountTotal: payment.amounts.totalCharged,
        currency: payment.currency,
        payment,
        lineSettlements,
        shippingDetails: churchPickup ? null : (current.shippingDetails || session.shipping_details || session.collected_information?.shipping_details || null),
        cart: current.cart?.length ? current.cart : draft.cart,
        items: current.items?.length ? current.items : draft.items,
        catalogRevision: current.catalogRevision || draft.catalogRevision || Number(session.metadata?.catalogRevision || 0) || null,
        campaignId: current.campaignId || draft.campaignId || session.metadata?.campaignId || '',
        campaignSlug: current.campaignSlug || draft.campaignSlug || session.metadata?.campaignSlug || '',
        campaign: current.campaign || draft.campaign || null,
        supportPolicy: current.supportPolicy || draft.supportPolicy || null,
        fulfillment: { ...existingFulfillment, status: fulfillmentStatus, statusHistory: existingFulfillment.statusHistory || [] },
        pickupCode: current.pickupCode || pickupCode,
        giveCodes,
        giveOneObligationCount: obligations.length,
        stripeEventIds: [...new Set([...(current.stripeEventIds || []), eventId].filter(Boolean))].slice(-200),
        createdAt: current.createdAt || paidAt,
        updatedAt: new Date().toISOString(),
        statusHistory: alreadyPaid ? history : [...history, { status: 'paid', at: paidAt, actor: 'system', note: churchPickup ? 'Stripe payment confirmed. Awaiting campaign batch allocation.' : 'Stripe payment confirmed.' }].slice(-100)
      };
    });
    await updateOrderWorkflow(sessionId, owner, 'order_finalized', { completed: true });

    const indexResult = await ensurePaymentIndexes(finalized);
    await updateOrderWorkflow(sessionId, owner, 'payment_indexes_ensured', { completed: true, fields: { indexResult } });

    const reconciliation = await proposeStripeReconciliation(stripe, finalized);
    const accountabilityProjection = supportForOrder({ ...finalized, payment: reconciliation.payment, lineSettlements: reconciliation.lineSettlements });
    const reconciled = await saveOrder(sessionId, (current) => ({
      ...current,
      payment: reconciliation.payment,
      lineSettlements: reconciliation.lineSettlements,
      accountabilityProjection,
      updatedAt: new Date().toISOString()
    }));
    await updateOrderWorkflow(sessionId, owner, 'accountability_projection_ensured', { completed: true });

    if (draft.draftId) await getStore('izhe-checkout-drafts').delete(draft.draftId).catch(() => {});
    await completeOrderWorkflow(sessionId, owner, { orderId: sessionId, eventId, lastStripeEventAt: eventCreatedAt || new Date().toISOString() });
    return reconciled;
  } catch (error) {
    await failOrderWorkflow(sessionId, owner, error).catch(() => {});
    await createReconciliationTask({
      type: 'paid_order_workflow_failed',
      sessionId,
      sourceId: eventId,
      severity: 'critical',
      message: `Paid-order workflow stopped at a resumable stage: ${String(error?.message || error).slice(0, 500)}`,
      details: { code: error?.code || 'workflow_failed' }
    }).catch(() => {});
    throw error;
  }
}
