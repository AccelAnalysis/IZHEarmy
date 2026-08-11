import { getStore } from '@netlify/blobs';
import { createGiveCode } from './codes.mjs';
import { deterministicObligationId, stableLineId } from './payment-rules.mjs';

export const GIVE_ONE_OBLIGATION_STORE = 'izhe-give-obligations';
const CODE_STORE = 'izhe-give-codes';

const nowIso = () => new Date().toISOString();

export function expectedGiveOneObligations({ sessionId, items = [], lineSettlements = [] } = {}) {
  const settlements = new Map((lineSettlements || []).map((line) => [line.productId + ':' + line.variantSnapshot?.id, line]));
  const expected = [];
  (items || []).forEach((item, lineIndex) => {
    if (!item?.giveOneEligible) return;
    const line = settlements.get(item.productId + ':' + (item.variantId || '')) || lineSettlements[lineIndex] || { lineId: stableLineId(sessionId, lineIndex) };
    const quantity = Math.max(0, Number(item.quantity || 0));
    const giftUnits = Math.max(1, Number(item.giveOneUnitsPerPaidUnit || 1));
    for (let paidUnitIndex = 0; paidUnitIndex < quantity; paidUnitIndex += 1) {
      for (let giftUnitIndex = 0; giftUnitIndex < giftUnits; giftUnitIndex += 1) {
        expected.push({
          obligationId: deterministicObligationId({ sessionId, lineId: line.lineId, paidUnitIndex, giftUnitIndex }),
          lineId: line.lineId,
          lineIndex,
          paidUnitIndex,
          giftUnitIndex,
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
          variantSnapshot: {
            id: item.variantId || '',
            fit: item.fit || '',
            size: item.size || '',
            color: item.color || '',
            sku: item.variantSku || ''
          }
        });
      }
    }
  });
  return expected;
}

async function patchObligation(obligationId, transform, attempts = 4) {
  const store = getStore(GIVE_ONE_OBLIGATION_STORE);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = await store.getWithMetadata(obligationId, { type: 'json', consistency: 'strong' });
    if (!current?.data) return null;
    const next = transform(current.data);
    const result = await store.setJSON(obligationId, next, { onlyIfMatch: current.etag });
    if (result.modified) return next;
  }
  throw Object.assign(new Error('Give One obligation changed concurrently.'), { code: 'give_one_conflict' });
}

async function ensureCodeMapping(obligation) {
  const obligations = getStore(GIVE_ONE_OBLIGATION_STORE);
  const codes = getStore(CODE_STORE);
  let current = obligation;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (!current.publicClaimCode) {
      const candidate = createGiveCode();
      const claimed = await patchObligation(current.obligationId, (value) => value.publicClaimCode ? value : { ...value, publicClaimCode: candidate, updatedAt: nowIso() });
      current = claimed || current;
    }
    const code = current.publicClaimCode;
    const existingCode = await codes.getWithMetadata(code, { type: 'json', consistency: 'strong' });
    if (existingCode?.data) {
      if (existingCode.data.obligationId && existingCode.data.obligationId !== current.obligationId) {
        current = await patchObligation(current.obligationId, (value) => ({ ...value, publicClaimCode: '', updatedAt: nowIso(), exceptionState: 'claim_code_collision_repaired' }));
        continue;
      }
      const repaired = {
        ...existingCode.data,
        code,
        obligationId: current.obligationId,
        sourceSessionId: current.sourceCheckoutSessionId,
        paymentIntentId: current.sourcePaymentIntentId,
        sourceOrderId: current.sourceOrderId,
        sourceLineId: current.sourceLineId,
        paidUnitIndex: current.paidUnitIndex,
        giftUnitIndex: current.giftUnitIndex,
        campaignId: current.campaignId,
        campaignSlug: current.campaignSlug,
        productId: current.productId,
        productName: current.productSnapshot?.name || existingCode.data.productName || '',
        productSnapshot: current.productSnapshot,
        entitlementPolicyVersion: current.entitlementPolicyVersion
      };
      const result = await codes.setJSON(code, repaired, { onlyIfMatch: existingCode.etag });
      if (result.modified || existingCode.data.obligationId === current.obligationId) return current;
      continue;
    }
    const mapping = {
      code,
      obligationId: current.obligationId,
      status: current.status === 'suspended_payment_review' ? 'suspended_payment_review' : current.status === 'cancelled' ? 'cancelled' : 'active',
      productId: current.productId,
      productName: current.productSnapshot?.name || '',
      productSnapshot: current.productSnapshot,
      campaignId: current.campaignId,
      campaignSlug: current.campaignSlug,
      campaign: current.campaign,
      sourceSessionId: current.sourceCheckoutSessionId,
      paymentIntentId: current.sourcePaymentIntentId,
      sourceOrderId: current.sourceOrderId,
      sourceLineId: current.sourceLineId,
      paidUnitIndex: current.paidUnitIndex,
      giftUnitIndex: current.giftUnitIndex,
      purchaserEmail: current.purchaserEmail,
      createdAt: current.createdAt,
      redeemedAt: null,
      redemptionId: null,
      cancelledAt: null,
      cancellationReason: null,
      entitlementPolicyVersion: current.entitlementPolicyVersion
    };
    const created = await codes.setJSON(code, mapping, { onlyIfNew: true });
    if (created.modified) return current;
    current = await patchObligation(current.obligationId, (value) => ({ ...value, publicClaimCode: '', updatedAt: nowIso(), exceptionState: 'claim_code_collision_repaired' }));
  }
  throw Object.assign(new Error('Unable to create a unique Give One claim-code mapping.'), { code: 'claim_code_collision' });
}

function legacyCodeForExpected(expected, legacyCodes, used) {
  const exact = (legacyCodes || []).find((item) => !used.has(item.code) && item.productId === expected.productId);
  if (exact) return exact.code;
  return (legacyCodes || []).find((item) => !used.has(item.code))?.code || '';
}

export async function ensureGiveOneObligations({ sessionId, paymentIntentId = '', orderId = '', items = [], lineSettlements = [], campaignId = '', campaignSlug = '', campaign = null, purchaserEmail = '', legacyCodes = [], entitlementPolicyVersion = 'give-one-v1' } = {}) {
  const store = getStore(GIVE_ONE_OBLIGATION_STORE);
  const expected = expectedGiveOneObligations({ sessionId, items, lineSettlements });
  const usedLegacyCodes = new Set();
  const ensured = [];
  for (const spec of expected) {
    let current = await store.get(spec.obligationId, { type: 'json', consistency: 'strong' });
    if (!current) {
      const legacyCode = legacyCodeForExpected(spec, legacyCodes, usedLegacyCodes);
      if (legacyCode) usedLegacyCodes.add(legacyCode);
      const at = nowIso();
      const record = {
        obligationId: spec.obligationId,
        publicClaimCode: legacyCode,
        sourceCheckoutSessionId: sessionId,
        sourcePaymentIntentId: paymentIntentId,
        sourceOrderId: orderId || sessionId,
        sourceLineId: spec.lineId,
        paidUnitIndex: spec.paidUnitIndex,
        giftUnitIndex: spec.giftUnitIndex,
        productId: spec.productId,
        productSnapshot: spec.productSnapshot,
        variantSnapshot: spec.variantSnapshot,
        campaignId,
        campaignSlug,
        campaign,
        entitlementPolicyVersion,
        status: 'active',
        statusHistory: [{ status: 'active', at, actor: 'system', reason: legacyCode ? 'legacy_code_wrapped' : 'paid_unit_entitlement' }],
        redemptionId: '',
        fulfillmentId: '',
        productionBatchReferences: [],
        paymentReviewReason: '',
        cancellationReason: '',
        exceptionState: '',
        purchaserEmail,
        createdAt: at,
        updatedAt: at
      };
      const created = await store.setJSON(spec.obligationId, record, { onlyIfNew: true });
      current = created.modified ? record : await store.get(spec.obligationId, { type: 'json', consistency: 'strong' });
    }
    if (!current) throw Object.assign(new Error('Give One obligation could not be created.'), { code: 'give_one_create_failed' });
    if (current.sourceCheckoutSessionId !== sessionId || current.sourceLineId !== spec.lineId || current.paidUnitIndex !== spec.paidUnitIndex || current.giftUnitIndex !== spec.giftUnitIndex) {
      throw Object.assign(new Error(`Give One obligation identity mismatch: ${spec.obligationId}`), { code: 'give_one_identity_mismatch' });
    }
    current = await ensureCodeMapping(current);
    ensured.push(current);
  }
  if (ensured.length !== expected.length) throw Object.assign(new Error('Give One obligation count does not match the paid entitlement count.'), { code: 'give_one_count_mismatch' });
  return ensured;
}

async function syncCodeStatus(obligation) {
  if (!obligation?.publicClaimCode) return;
  const codes = getStore(CODE_STORE);
  const current = await codes.getWithMetadata(obligation.publicClaimCode, { type: 'json', consistency: 'strong' });
  if (!current?.data) return ensureCodeMapping(obligation);
  if (['redeemed', 'fulfilled', 'in_fulfillment'].includes(current.data.status)) return;
  const status = obligation.status === 'suspended_payment_review' ? 'suspended_payment_review' : obligation.status === 'cancelled' ? 'cancelled' : 'active';
  await codes.setJSON(obligation.publicClaimCode, {
    ...current.data,
    obligationId: obligation.obligationId,
    status,
    cancelledAt: status === 'cancelled' ? obligation.updatedAt : null,
    cancellationReason: status === 'cancelled' ? obligation.cancellationReason : null,
    paymentReviewReason: status === 'suspended_payment_review' ? obligation.paymentReviewReason : ''
  }, { onlyIfMatch: current.etag });
}

export async function transitionGiveOneObligations({ sessionId, obligationIds = null, action, reason = '', eventId = '' } = {}) {
  const store = getStore(GIVE_ONE_OBLIGATION_STORE);
  const { blobs } = await store.list();
  const allowedIds = obligationIds ? new Set(obligationIds) : null;
  const results = [];
  for (const blob of blobs) {
    if (allowedIds && !allowedIds.has(blob.key)) continue;
    const current = await store.get(blob.key, { type: 'json', consistency: 'strong' });
    if (!current || current.sourceCheckoutSessionId !== sessionId) continue;
    const terminal = ['redeemed', 'in_fulfillment', 'fulfilled'].includes(current.status);
    let nextStatus = current.status;
    let exceptionState = current.exceptionState || '';
    if (action === 'suspend' && current.status === 'active') nextStatus = 'suspended_payment_review';
    if (action === 'reactivate' && current.status === 'suspended_payment_review') nextStatus = 'active';
    if (action === 'cancel' && !terminal && ['active', 'suspended_payment_review'].includes(current.status)) nextStatus = 'cancelled';
    if ((action === 'cancel' || action === 'suspend') && terminal) exceptionState = 'payment_reversal_after_gift_commitment';
    if (nextStatus === current.status && exceptionState === (current.exceptionState || '')) {
      results.push(current);
      continue;
    }
    const at = nowIso();
    const updated = await patchObligation(current.obligationId, (value) => ({
      ...value,
      status: nextStatus,
      paymentReviewReason: nextStatus === 'suspended_payment_review' ? reason : nextStatus === 'active' ? '' : value.paymentReviewReason,
      cancellationReason: nextStatus === 'cancelled' ? reason : value.cancellationReason,
      exceptionState,
      updatedAt: at,
      statusHistory: [...(value.statusHistory || []), { status: nextStatus, at, actor: 'system', reason, eventId }].slice(-100)
    }));
    if (updated) {
      await syncCodeStatus(updated);
      results.push(updated);
    }
  }
  return results;
}

export async function listGiveOneObligations(limit = 10000) {
  const store = getStore(GIVE_ONE_OBLIGATION_STORE);
  const { blobs } = await store.list();
  const results = [];
  for (const blob of blobs.slice(-limit).reverse()) {
    const value = await store.get(blob.key, { type: 'json', consistency: 'strong' });
    if (value) results.push(value);
  }
  return results;
}
