import { SUPPORT_CALCULATION_VERSION } from './payment-rules.mjs';

const clean = (value, max = 240) => String(value ?? '').trim().slice(0, max);

export function supportPolicyFingerprint(policy = {}) {
  return JSON.stringify({
    supportModel: policy.supportModel || 'percentage',
    supportRate: Number(policy.supportRate || 0),
    supportLabel: clean(policy.supportLabel, 200),
    currency: String(policy.currency || 'usd').toLowerCase(),
    eligibleProductBasis: policy.eligibleProductBasis || 'explicit_support_eligible_snapshot',
    eligibleUnitBasis: policy.eligibleUnitBasis || 'settled_whole_support_eligible_units',
    calculationPolicyVersion: policy.calculationPolicyVersion || SUPPORT_CALCULATION_VERSION
  });
}

export function createSupportPolicy(campaign, { version = 1, effectiveAt = new Date().toISOString(), lockedAt = '', creator = 'admin-token' } = {}) {
  const campaignId = clean(campaign?.id, 100);
  return {
    campaignId,
    policyId: `${campaignId || 'campaign'}:support`,
    policyVersion: `${campaignId || 'campaign'}:support:v${Math.max(1, Number(version) || 1)}`,
    version: Math.max(1, Number(version) || 1),
    supportModel: ['percentage', 'per_unit', 'fixed'].includes(campaign?.supportModel) ? campaign.supportModel : 'percentage',
    supportRate: Math.max(0, Number(campaign?.supportRate || 0)),
    supportLabel: clean(campaign?.supportLabel || 'Ministry support generated', 200),
    currency: 'usd',
    eligibleProductBasis: 'explicit_support_eligible_snapshot',
    eligibleUnitBasis: 'settled_whole_support_eligible_units',
    calculationPolicyVersion: SUPPORT_CALCULATION_VERSION,
    effectiveAt,
    creator,
    source: creator,
    lockedAt: lockedAt || ''
  };
}

function normalizePolicies(campaign) {
  if (Array.isArray(campaign?.supportPolicies) && campaign.supportPolicies.length) return campaign.supportPolicies.map((policy) => ({ ...policy }));
  if (!campaign?.id) return [];
  return [createSupportPolicy(campaign, { version: 1, effectiveAt: campaign.createdAt || new Date().toISOString(), lockedAt: campaign.supportPolicyLockedAt || '' })];
}

export function reconcileCampaignSupportPolicies(candidate, existing = null, { hasQualifyingCommerce = false, now = new Date().toISOString() } = {}) {
  const policies = normalizePolicies(existing || candidate);
  if (!policies.length) {
    const first = createSupportPolicy(candidate, { version: 1, effectiveAt: candidate.createdAt || now });
    return { ...candidate, supportPolicies: [first], activeSupportPolicyVersion: first.policyVersion, supportPolicyLockedAt: '' };
  }
  const activeVersion = existing?.activeSupportPolicyVersion || policies.at(-1).policyVersion;
  const activeIndex = Math.max(0, policies.findIndex((policy) => policy.policyVersion === activeVersion));
  const active = policies[activeIndex] || policies.at(-1);
  const proposed = createSupportPolicy(candidate, { version: active.version || activeIndex + 1, effectiveAt: active.effectiveAt || now, lockedAt: active.lockedAt || '' });
  const changed = supportPolicyFingerprint(active) !== supportPolicyFingerprint(proposed);
  if (!changed) {
    if (hasQualifyingCommerce && !active.lockedAt) policies[activeIndex] = { ...active, lockedAt: now };
    return {
      ...candidate,
      supportPolicies: policies,
      activeSupportPolicyVersion: active.policyVersion,
      supportPolicyLockedAt: policies[activeIndex]?.lockedAt || ''
    };
  }
  if (!hasQualifyingCommerce) {
    const replacement = { ...proposed, policyId: active.policyId, policyVersion: active.policyVersion, version: active.version, effectiveAt: active.effectiveAt || now, lockedAt: '' };
    policies[activeIndex] = replacement;
    return { ...candidate, supportPolicies: policies, activeSupportPolicyVersion: replacement.policyVersion, supportPolicyLockedAt: '' };
  }
  policies[activeIndex] = { ...active, lockedAt: active.lockedAt || now };
  const nextVersion = Math.max(...policies.map((policy) => Number(policy.version || 0)), 0) + 1;
  const next = createSupportPolicy(candidate, { version: nextVersion, effectiveAt: now });
  policies.push(next);
  return { ...candidate, supportPolicies: policies.slice(-50), activeSupportPolicyVersion: next.policyVersion, supportPolicyLockedAt: policies[activeIndex].lockedAt };
}

export function activeSupportPolicy(campaign) {
  const policies = normalizePolicies(campaign);
  if (!policies.length) return null;
  return policies.find((policy) => policy.policyVersion === campaign?.activeSupportPolicyVersion) || policies.at(-1);
}

export function supportPolicySnapshot(campaign) {
  const policy = activeSupportPolicy(campaign);
  return policy ? structuredClone(policy) : null;
}
