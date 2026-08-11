import { randomBytes } from 'node:crypto';

export const FULFILLMENT_MODES = ['individual_shipping', 'church_batch'];
export const CAMPAIGN_FULFILLMENT_METHODS = ['individual_shipping', 'church_batch', 'hybrid'];
export const CHURCH_PICKUP_STATUSES = ['awaiting_batch', 'allocated', 'in_production', 'ready_for_pickup', 'picked_up', 'exception', 'no_show', 'cancelled'];

const US_STATES = new Set(['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC']);
const clean = (value, max = 300) => String(value ?? '').trim().slice(0, max);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const zipPattern = /^\d{5}(?:-\d{4})?$/;

export function emptyChurchBatch() {
  return { pickupLocationName: '', address1: '', address2: '', city: '', state: '', postalCode: '', country: 'US', publicInstructions: '', internalInstructions: '', estimatedReadyAt: '', pickupStartAt: '', pickupEndAt: '', contactName: '', contactEmail: '', contactPhone: '' };
}

function normalizedIso(value, label, errors) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) { errors.push(`${label} must be a valid date.`); return ''; }
  return date.toISOString();
}

export function normalizeChurchBatch(input = {}, { startAt = '', endAt = '' } = {}) {
  const errors = [];
  const state = clean(input.state, 2).toUpperCase();
  const postalCode = clean(input.postalCode, 10);
  const contactEmail = clean(input.contactEmail, 254).toLowerCase();
  const estimatedReadyAt = normalizedIso(input.estimatedReadyAt, 'Estimated ready date', errors);
  const pickupStartAt = normalizedIso(input.pickupStartAt, 'Pickup-window start', errors);
  const pickupEndAt = normalizedIso(input.pickupEndAt, 'Pickup-window end', errors);
  const result = {
    pickupLocationName: clean(input.pickupLocationName, 180), address1: clean(input.address1, 180), address2: clean(input.address2, 180), city: clean(input.city, 120), state, postalCode, country: 'US',
    publicInstructions: clean(input.publicInstructions, 2500), internalInstructions: clean(input.internalInstructions, 2500), estimatedReadyAt, pickupStartAt, pickupEndAt,
    contactName: clean(input.contactName, 160), contactEmail, contactPhone: clean(input.contactPhone, 40)
  };
  if (state && !US_STATES.has(state)) errors.push('Pickup state must be a valid two-letter U.S. abbreviation.');
  if (postalCode && !zipPattern.test(postalCode)) errors.push('Pickup ZIP must be five digits or ZIP+4.');
  if (contactEmail && !emailPattern.test(contactEmail)) errors.push('Church pickup contact email must be valid.');
  if (pickupStartAt && pickupEndAt && new Date(pickupEndAt) <= new Date(pickupStartAt)) errors.push('Pickup-window end must be later than pickup-window start.');
  const orderingStart = startAt ? new Date(startAt) : null;
  const orderingEnd = endAt ? new Date(endAt) : null;
  if (orderingStart && !Number.isNaN(orderingStart.valueOf())) {
    if (estimatedReadyAt && new Date(estimatedReadyAt) < orderingStart) errors.push('Estimated ready date cannot precede the campaign ordering start.');
    if (pickupStartAt && new Date(pickupStartAt) < orderingStart) errors.push('Pickup-window start cannot precede the campaign ordering start.');
    if (pickupEndAt && new Date(pickupEndAt) < orderingStart) errors.push('Pickup-window end cannot precede the campaign ordering start.');
  }
  if (orderingEnd && !Number.isNaN(orderingEnd.valueOf())) {
    if (pickupStartAt && new Date(pickupStartAt) < orderingEnd) errors.push('Pickup-window start cannot occur before the campaign ordering period ends.');
    if (pickupEndAt && new Date(pickupEndAt) < orderingEnd) errors.push('Pickup-window end cannot occur before the campaign ordering period ends.');
  }
  return { value: result, errors };
}

export function churchBatchReadiness(campaign) {
  const method = CAMPAIGN_FULFILLMENT_METHODS.includes(campaign?.fulfillmentMethod) ? campaign.fulfillmentMethod : 'individual_shipping';
  if (method === 'individual_shipping') return { required: false, complete: true, errors: [], warnings: [], churchBatch: emptyChurchBatch() };
  const { value, errors } = normalizeChurchBatch(campaign?.churchBatch || {}, { startAt: campaign?.startAt, endAt: campaign?.endAt });
  if (!value.pickupLocationName) errors.push('Pickup location name is required.');
  if (!value.address1) errors.push('Pickup address is required.');
  if (!value.city) errors.push('Pickup city is required.');
  if (!value.state) errors.push('Pickup state is required.');
  if (!value.postalCode) errors.push('Pickup ZIP is required.');
  if (!value.publicInstructions) errors.push('Public pickup instructions are required.');
  const warnings = [];
  if (!value.estimatedReadyAt && !value.pickupStartAt) warnings.push('Pickup date not yet scheduled.');
  return { required: true, complete: errors.length === 0, errors: [...new Set(errors)], warnings, churchBatch: value };
}

export function publicFulfillmentProjection(campaign) {
  const method = CAMPAIGN_FULFILLMENT_METHODS.includes(campaign?.fulfillmentMethod) ? campaign.fulfillmentMethod : 'individual_shipping';
  const readiness = churchBatchReadiness(campaign);
  const availableModes = method === 'hybrid' ? ['individual_shipping', 'church_batch'] : [method === 'church_batch' ? 'church_batch' : 'individual_shipping'];
  return {
    campaignMethod: method, availableModes, ready: readiness.complete,
    churchBatch: method === 'individual_shipping' ? null : {
      pickupLocationName: readiness.churchBatch.pickupLocationName, address1: readiness.churchBatch.address1, address2: readiness.churchBatch.address2, city: readiness.churchBatch.city,
      state: readiness.churchBatch.state, postalCode: readiness.churchBatch.postalCode, country: 'US', publicInstructions: readiness.churchBatch.publicInstructions,
      estimatedReadyAt: readiness.churchBatch.estimatedReadyAt, pickupStartAt: readiness.churchBatch.pickupStartAt, pickupEndAt: readiness.churchBatch.pickupEndAt
    }
  };
}

export function resolveFulfillmentMode({ source = 'campaign', campaignMethod = 'individual_shipping', requestedMode = '' } = {}) {
  if (source === 'general_storefront') return 'individual_shipping';
  if (!CAMPAIGN_FULFILLMENT_METHODS.includes(campaignMethod)) throw new Error('The campaign fulfillment method is invalid.');
  const requested = clean(requestedMode, 40);
  if (campaignMethod === 'hybrid') {
    if (!requested) throw new Error('Choose church pickup or direct shipping before checkout.');
    if (!FULFILLMENT_MODES.includes(requested)) throw new Error('The selected fulfillment mode is not supported.');
    return requested;
  }
  const resolved = campaignMethod === 'church_batch' ? 'church_batch' : 'individual_shipping';
  if (requested && requested !== resolved) throw new Error('The selected fulfillment mode is not available for this campaign.');
  return resolved;
}

export function createFulfillmentSnapshot({ campaign = null, mode = 'individual_shipping', source = 'campaign' } = {}) {
  const method = campaign?.fulfillmentMethod || 'individual_shipping';
  const readiness = churchBatchReadiness(campaign || { fulfillmentMethod: 'individual_shipping' });
  const pickup = mode === 'church_batch' ? readiness.churchBatch : null;
  return {
    mode, campaignMethod: method, source,
    pickupLocation: pickup ? { pickupLocationName: pickup.pickupLocationName, address1: pickup.address1, address2: pickup.address2, city: pickup.city, state: pickup.state, postalCode: pickup.postalCode, country: 'US' } : null,
    publicInstructions: pickup?.publicInstructions || '', estimatedReadyAt: pickup?.estimatedReadyAt || '', pickupStartAt: pickup?.pickupStartAt || '', pickupEndAt: pickup?.pickupEndAt || '',
    status: mode === 'church_batch' ? 'awaiting_batch' : 'processing', statusHistory: []
  };
}

export function legacyFulfillmentSnapshot(order = {}) {
  if (order.fulfillment?.mode) return order.fulfillment;
  return { mode: 'individual_shipping', campaignMethod: order.campaign?.fulfillmentMethod || 'individual_shipping', source: order.campaignId ? 'campaign' : 'general_storefront', pickupLocation: null, publicInstructions: '', estimatedReadyAt: '', pickupStartAt: '', pickupEndAt: '', status: order.status || 'processing', statusHistory: [] };
}

export function appendFulfillmentHistory(fulfillment, status, note = '', actor = 'admin', at = new Date().toISOString()) {
  const current = fulfillment || legacyFulfillmentSnapshot({});
  const history = Array.isArray(current.statusHistory) ? current.statusHistory : [];
  return { ...current, status, statusHistory: [...history, { status, note: clean(note, 500), actor: clean(actor, 120) || 'admin', at }].slice(-100) };
}

export function createPickupCode(randomBytesFn = randomBytes) {
  const raw = randomBytesFn(6).toString('hex').toUpperCase();
  return `PICK-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

export function stablePickupCode(existing = '', randomBytesFn = randomBytes) { return clean(existing, 40) || createPickupCode(randomBytesFn); }

export function checkoutSessionTotals(session = {}, mode = 'individual_shipping') {
  return { amountSubtotal: Number(session.amount_subtotal || 0), amountShipping: mode === 'church_batch' ? 0 : Number(session.total_details?.amount_shipping || 0), amountTax: Number(session.total_details?.amount_tax || 0), amountDiscount: Number(session.total_details?.amount_discount || 0), amountTotal: Number(session.amount_total || 0), currency: session.currency || 'usd' };
}

export function resolvePickupHandoffTransition({ currentStatus = '', orderStatus = '', action = 'picked_up', note = '', releasedBy = '' } = {}) {
  const cleanAction = clean(action, 40); const cleanNote = clean(note, 1000); const actor = clean(releasedBy, 160);
  if (cleanAction === 'picked_up') {
    if (currentStatus === 'picked_up') throw new Error('This order has already been marked picked up.');
    if (currentStatus !== 'ready_for_pickup' && orderStatus !== 'ready_for_pickup') throw new Error('Only an order that is ready for pickup may be marked picked up.');
    if (!actor) throw new Error('Record who released the order.');
    return { orderStatus: 'completed', fulfillmentStatus: 'picked_up' };
  }
  if (cleanAction === 'reverse_pickup') {
    if (currentStatus !== 'picked_up') throw new Error('Only a picked-up order may be reversed.');
    if (!cleanNote) throw new Error('A corrective note is required to reverse a pickup confirmation.');
    return { orderStatus: 'ready_for_pickup', fulfillmentStatus: 'ready_for_pickup' };
  }
  if (cleanAction === 'exception' || cleanAction === 'no_show') {
    if (currentStatus === 'picked_up') throw new Error('A picked-up order must be reversed before recording an exception.');
    if (!cleanNote) throw new Error('An exception or no-show note is required.');
    return { orderStatus: 'exception', fulfillmentStatus: cleanAction };
  }
  throw new Error('Unsupported pickup action.');
}

export function buildCheckoutSessionConfiguration({ lineItems, successUrl, cancelUrl, metadata, mode, campaign = null, hasGiveOneItems = false, shippingRateId = '', shippingCents = 699 }) {
  const churchPickup = mode === 'church_batch';
  const pickupName = campaign?.churchBatch?.pickupLocationName || campaign?.organization || 'the campaign pickup location';
  const config = {
    mode: 'payment', line_items: lineItems, success_url: successUrl, cancel_url: cancelUrl, automatic_tax: { enabled: true }, allow_promotion_codes: true,
    billing_address_collection: churchPickup ? 'required' : 'auto', phone_number_collection: { enabled: true }, customer_creation: 'always', invoice_creation: { enabled: true }, metadata, payment_intent_data: { metadata },
    custom_text: { submit: { message: churchPickup ? `Church pickup: this order will be delivered with the campaign order to ${pickupName}. No individual shipment will be sent. Pickup details will appear on the IZHE confirmation page.${hasGiveOneItems ? ' Eligible shirts still create separate Give One claim codes.' : ''}` : campaign ? `This purchase supports ${campaign.organization}. ${hasGiveOneItems ? 'Eligible shirts also create Give One claim codes.' : ''}`.trim() : hasGiveOneItems ? 'Each eligible shirt purchased creates one Give One claim code after payment.' : 'Your order will be prepared after payment is confirmed.' } }
  };
  if (!churchPickup) {
    config.shipping_address_collection = { allowed_countries: ['US'] };
    config.custom_text.shipping_address = { message: 'Enter the U.S. address where this order should be shipped.' };
    if (shippingRateId) config.shipping_options = [{ shipping_rate: shippingRateId }];
    else if (Number.isFinite(Number(shippingCents)) && Number(shippingCents) > 0) config.shipping_options = [{ shipping_rate_data: { type: 'fixed_amount', fixed_amount: { amount: Number(shippingCents), currency: 'usd' }, display_name: 'Standard U.S. shipping', tax_behavior: 'exclusive', delivery_estimate: { minimum: { unit: 'business_day', value: 5 }, maximum: { unit: 'business_day', value: 10 } } } }];
  }
  return config;
}
