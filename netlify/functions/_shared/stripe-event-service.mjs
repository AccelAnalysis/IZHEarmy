import { createHash } from 'node:crypto';
import { getStore } from '@netlify/blobs';

export const STRIPE_EVENT_STORE = 'izhe-stripe-events';

const nowIso = () => new Date().toISOString();
const clean = (value, max = 240) => String(value ?? '').trim().slice(0, max);

function objectReferences(event) {
  const object = event?.data?.object || {};
  const objectType = clean(object?.object || 'unknown', 80);
  const objectId = clean(object?.id, 180);
  let checkoutSessionId = '';
  let paymentIntentId = '';
  let chargeId = '';
  if (objectType === 'checkout.session') {
    checkoutSessionId = objectId;
    paymentIntentId = clean(typeof object.payment_intent === 'string' ? object.payment_intent : object.payment_intent?.id, 180);
  } else if (objectType === 'payment_intent') {
    paymentIntentId = objectId;
    chargeId = clean(typeof object.latest_charge === 'string' ? object.latest_charge : object.latest_charge?.id, 180);
  } else if (objectType === 'charge') {
    chargeId = objectId;
    paymentIntentId = clean(typeof object.payment_intent === 'string' ? object.payment_intent : object.payment_intent?.id, 180);
  } else if (objectType === 'refund') {
    paymentIntentId = clean(typeof object.payment_intent === 'string' ? object.payment_intent : object.payment_intent?.id, 180);
    chargeId = clean(typeof object.charge === 'string' ? object.charge : object.charge?.id, 180);
  } else if (objectType === 'dispute') {
    paymentIntentId = clean(typeof object.payment_intent === 'string' ? object.payment_intent : object.payment_intent?.id, 180);
    chargeId = clean(typeof object.charge === 'string' ? object.charge : object.charge?.id, 180);
  }
  return { objectType, objectId, checkoutSessionId, paymentIntentId, chargeId };
}

export function stripePayloadDigest(rawBody) {
  return createHash('sha256').update(String(rawBody || ''), 'utf8').digest('hex');
}

export function privacyMinimizedStripeReceipt(event, rawBody, { buildVersion = '' } = {}) {
  const at = nowIso();
  const refs = objectReferences(event);
  return {
    stripeEventId: clean(event?.id, 180),
    stripeEventType: clean(event?.type, 180),
    stripeEventCreatedAt: Number.isFinite(Number(event?.created)) ? new Date(Number(event.created) * 1000).toISOString() : '',
    receiptTimestamp: at,
    livemode: Boolean(event?.livemode),
    apiVersion: clean(event?.api_version, 80),
    ...refs,
    orderId: '',
    processingState: 'received',
    processingStage: 'received',
    attemptCount: 0,
    firstAttemptTimestamp: '',
    lastAttemptTimestamp: '',
    processedTimestamp: '',
    lastErrorCode: '',
    lastErrorSummary: '',
    reconciliationState: 'pending',
    payloadDigest: stripePayloadDigest(rawBody),
    buildVersion: clean(buildVersion || process.env.COMMIT_REF || process.env.DEPLOY_ID || '', 180)
  };
}

async function getReceiptWithMetadata(eventId) {
  return getStore(STRIPE_EVENT_STORE).getWithMetadata(eventId, { type: 'json', consistency: 'strong' });
}

async function patchReceipt(eventId, transform, attempts = 4) {
  const store = getStore(STRIPE_EVENT_STORE);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = await getReceiptWithMetadata(eventId);
    if (!current?.data) return null;
    const next = transform(current.data);
    const result = await store.setJSON(eventId, next, { onlyIfMatch: current.etag });
    if (result.modified) return next;
  }
  throw Object.assign(new Error('Stripe event receipt changed concurrently.'), { code: 'event_receipt_conflict' });
}

export async function beginStripeEventReceipt(event, rawBody, options = {}) {
  const eventId = clean(event?.id, 180);
  if (!eventId) throw Object.assign(new Error('Stripe event is missing its immutable event ID.'), { code: 'missing_event_id' });
  const store = getStore(STRIPE_EVENT_STORE);
  let current = await getReceiptWithMetadata(eventId);
  if (!current?.data) {
    const initial = privacyMinimizedStripeReceipt(event, rawBody, options);
    const created = await store.setJSON(eventId, initial, { onlyIfNew: true });
    if (!created.modified) current = await getReceiptWithMetadata(eventId);
    else current = await getReceiptWithMetadata(eventId);
  }
  if (current?.data?.processingState === 'processed' || current?.data?.processingState === 'ignored_supported_noop') {
    return { receipt: current.data, alreadyProcessed: true };
  }
  const attemptAt = nowIso();
  const receipt = await patchReceipt(eventId, (value) => ({
    ...value,
    processingState: 'processing',
    processingStage: value.processingStage || 'received',
    attemptCount: Number(value.attemptCount || 0) + 1,
    firstAttemptTimestamp: value.firstAttemptTimestamp || attemptAt,
    lastAttemptTimestamp: attemptAt,
    lastErrorCode: '',
    lastErrorSummary: ''
  }));
  return { receipt, alreadyProcessed: false };
}

export async function updateStripeEventStage(eventId, processingStage, fields = {}) {
  return patchReceipt(eventId, (value) => ({ ...value, ...fields, processingStage: clean(processingStage, 120), lastAttemptTimestamp: nowIso() }));
}

export async function linkStripeEventOrder(eventId, orderId, fields = {}) {
  return patchReceipt(eventId, (value) => ({ ...value, ...fields, orderId: clean(orderId, 180), lastAttemptTimestamp: nowIso() }));
}

export async function completeStripeEvent(eventId, { reconciliationState = 'reconciled', processingState = 'processed', fields = {} } = {}) {
  const at = nowIso();
  return patchReceipt(eventId, (value) => ({
    ...value,
    ...fields,
    processingState,
    processingStage: 'event_completed',
    processedTimestamp: at,
    lastAttemptTimestamp: at,
    reconciliationState,
    lastErrorCode: '',
    lastErrorSummary: ''
  }));
}

export async function failStripeEvent(eventId, error, { reconciliationRequired = false, fields = {} } = {}) {
  const code = clean(error?.code || error?.name || 'processing_failed', 120);
  const summary = clean(error?.message || 'Stripe event processing failed.', 500);
  return patchReceipt(eventId, (value) => ({
    ...value,
    ...fields,
    processingState: reconciliationRequired ? 'reconciliation_required' : 'failed_retryable',
    reconciliationState: reconciliationRequired ? 'event_unmatched' : value.reconciliationState || 'pending',
    lastErrorCode: code,
    lastErrorSummary: summary,
    lastAttemptTimestamp: nowIso()
  }));
}

export async function getStripeEventReceipt(eventId) {
  return getStore(STRIPE_EVENT_STORE).get(eventId, { type: 'json', consistency: 'strong' });
}

export async function listStripeEventReceipts(limit = 5000) {
  const store = getStore(STRIPE_EVENT_STORE);
  const { blobs } = await store.list();
  const results = [];
  for (const blob of blobs.slice(-limit).reverse()) {
    const value = await store.get(blob.key, { type: 'json', consistency: 'strong' });
    if (value) results.push(value);
  }
  return results;
}
