import { randomUUID } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import Stripe from 'stripe';
import { normalizeCart } from './_shared/catalog.mjs';
import { loadCatalog, publicCatalog } from './_shared/catalog-service.mjs';
import { campaignAllowsProduct, campaignIsPurchasable } from './_shared/campaign-rules.mjs';
import { findCampaignBySlug } from './_shared/campaign-service.mjs';
import { json, methodNotAllowed } from './_shared/http.mjs';

async function resolvePrices(stripe, cart, productMap) {
  const lookupKeys = [...new Set(cart.map((item) => productMap.get(item.productId).lookupKey))];
  const prices = [];
  for (let index = 0; index < lookupKeys.length; index += 10) {
    const batch = lookupKeys.slice(index, index + 10);
    const response = await stripe.prices.list({ active: true, lookup_keys: batch, limit: 100 });
    prices.push(...response.data);
  }
  const byLookupKey = new Map(prices.map((price) => [price.lookup_key, price]));
  for (const item of cart) {
    const product = productMap.get(item.productId);
    const price = byLookupKey.get(product.lookupKey);
    if (!price) throw new Error(`Stripe price ${product.lookupKey} is unavailable.`);
    if (price.currency !== 'usd' || price.unit_amount !== product.unitAmount) {
      throw new Error(`Stripe price ${product.lookupKey} does not match the approved IZHE catalog.`);
    }
  }
  return byLookupKey;
}

function orderItemSnapshot(product, item) {
  const variant = product.variants?.find((candidate) => candidate.id === item.variantId) || null;
  return {
    productId: product.id,
    productName: product.name,
    shortName: product.shortName,
    productType: product.productType,
    collectionId: product.collectionId,
    sku: product.sku,
    lookupKey: product.lookupKey,
    unitAmount: product.unitAmount,
    currency: product.currency,
    giveOneEligible: product.giveOneEligible,
    giveOneUnitsPerPaidUnit: product.giveOneUnitsPerPaidUnit,
    productImage: product.primaryImage?.url || product.images?.[0]?.url || '',
    variantId: item.variantId,
    fit: variant?.fit || item.fit || '',
    size: variant?.size || item.size || '',
    color: variant?.color || item.color || '',
    variantSku: variant?.sku || '',
    eligibleGiftVariants: (product.variants || []).filter((candidate) => candidate.status !== 'disabled' && !['retired', 'sold_out'].includes(candidate.availabilityStatus)).map((candidate) => ({
      id: candidate.id,
      fit: candidate.fit,
      size: candidate.size,
      color: candidate.color,
      sku: candidate.sku
    })),
    quantity: item.quantity
  };
}

function campaignSnapshot(campaign) {
  if (!campaign) return null;
  return {
    id: campaign.id,
    slug: campaign.slug,
    title: campaign.title,
    organization: campaign.organization,
    ministryObjective: campaign.ministryObjective,
    fulfillmentMethod: campaign.fulfillmentMethod,
    supportModel: campaign.supportModel,
    supportRate: campaign.supportRate,
    supportLabel: campaign.supportLabel
  };
}

export default async (request) => {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  if (!process.env.STRIPE_SECRET_KEY) return json({ error: 'Checkout is not configured yet. Add STRIPE_SECRET_KEY in Netlify.' }, 503);

  let draftId = '';
  try {
    const payload = await request.json();
    const campaignSlug = String(payload.campaignSlug || '').trim().toLowerCase();
    const campaign = campaignSlug ? await findCampaignBySlug(campaignSlug) : null;
    if (campaignSlug && (!campaign || !campaignIsPurchasable(campaign))) {
      return json({ error: 'This campaign is not currently accepting orders.' }, 409);
    }
    const { catalog } = await loadCatalog();
    const liveCatalog = publicCatalog(catalog);
    const availableProducts = campaign
      ? liveCatalog.products.filter((product) => product.isPurchasable && campaignAllowsProduct(campaign, product))
      : liveCatalog.products.filter((product) => product.isPurchasable);
    const cart = normalizeCart(payload.cart, availableProducts);
    const productMap = new Map(availableProducts.map((product) => [product.id, product]));
    if (campaign && cart.some((item) => !campaignAllowsProduct(campaign, productMap.get(item.productId)))) {
      return json({ error: 'A product in your cart is not available through this campaign.' }, 409);
    }
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const prices = await resolvePrices(stripe, cart, productMap);
    const origin = new URL(request.url).origin;
    const siteUrl = (process.env.URL || process.env.SITE_URL || origin).replace(/\/$/, '');
    const shippingCents = Number.parseInt(process.env.IZHE_SHIPPING_CENTS || '699', 10);
    const shippingRateId = String(process.env.STRIPE_STANDARD_SHIPPING_RATE_ID || '').trim();

    draftId = randomUUID();
    const drafts = getStore('izhe-checkout-drafts');
    const items = cart.map((item) => orderItemSnapshot(productMap.get(item.productId), item));
    const campaignData = campaignSnapshot(campaign);
    const draftRecord = {
      cart,
      items,
      catalogRevision: liveCatalog.revision,
      campaignId: campaign?.id || '',
      campaignSlug: campaign?.slug || '',
      campaign: campaignData,
      status: 'created',
      createdAt: new Date().toISOString()
    };
    await drafts.setJSON(draftId, draftRecord, { onlyIfNew: true });

    const lineItems = cart.map((item) => ({
      quantity: item.quantity,
      price: prices.get(productMap.get(item.productId).lookupKey).id
    }));
    const hasGiveOneItems = items.some((item) => item.giveOneEligible);
    const metadata = {
      draftId,
      source: campaign ? 'izhe-campaign' : 'izhe-website',
      catalogRevision: String(liveCatalog.revision),
      campaignId: campaign?.id || '',
      campaignSlug: campaign?.slug || ''
    };
    const sessionConfig = {
      mode: 'payment',
      line_items: lineItems,
      success_url: `${siteUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: campaign ? `${siteUrl}/campaign/${encodeURIComponent(campaign.slug)}?checkout=cancelled` : `${siteUrl}/?checkout=cancelled#collection`,
      automatic_tax: { enabled: true },
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      shipping_address_collection: { allowed_countries: ['US'] },
      phone_number_collection: { enabled: true },
      customer_creation: 'always',
      invoice_creation: { enabled: true },
      metadata,
      payment_intent_data: { metadata },
      custom_text: {
        submit: {
          message: campaign
            ? `This purchase supports ${campaign.organization}. ${hasGiveOneItems ? 'Eligible shirts also create Give One claim codes.' : ''}`.trim()
            : hasGiveOneItems
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
    await drafts.setJSON(draftId, { ...draftRecord, status: 'checkout_created', sessionId: session.id });
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
