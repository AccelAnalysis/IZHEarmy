const SITE_READY_SOURCE_IDS = new Set([
  'source-izhe-question-friend-blue',
  'source-izhe-question-healer-blue',
  'source-izhe-core-wordmark-blue',
  'source-izhe-question-lord-blue',
  'source-izhe-question-peace-blue',
  'source-izhe-question-king-blue',
  'source-izhe-white-logo-hoodie-mockup',
  'source-izhe-charcoal-pink-logo-long-sleeve-flatlay',
  'source-izhe-gray-charcoal-tagline-hoodies-flatlay',
  'source-izhe-white-blue-logo-long-sleeve-flatlay',
  'source-izhe-white-blue-logo-tee-flatlay'
]);

export const SITE_MEDIA_POLICY_VERSION = 1;

export function sourceMediaPolicy(item) {
  if (!item?.static || !SITE_READY_SOURCE_IDS.has(item.id)) return null;
  const editorialOnly = item.category === 'apparel_product' && item.productAccuracyStatus !== 'accurate';
  return {
    usageStatus: 'approved',
    rightsStatus: 'owned_no_people',
    tags: [...new Set([...(item.tags || []), 'site-ready', ...(editorialOnly ? ['editorial-use-only'] : [])])],
    notes: [
      item.notes,
      editorialOnly
        ? 'Approved for general website/editorial use only. Do not use as a current catalog product image until the SKU, garment, color, and print placement are verified.'
        : 'Approved for IZHE website and teaching use as a no-person brand-owned source asset.'
    ].filter(Boolean).join(' '),
    siteMediaPolicyVersion: SITE_MEDIA_POLICY_VERSION,
    siteMediaPolicyAppliedAt: '2026-07-16T18:00:00.000Z'
  };
}

export function applySourceMediaPolicy(item, overlay = null) {
  const policy = sourceMediaPolicy(item);
  if (!policy) return { ...item, ...(overlay || {}) };
  if (overlay?.reviewSource === 'manual') return { ...item, ...policy, ...overlay };
  return { ...item, ...(overlay || {}), ...policy };
}

export function isEditorialSiteMedia(media) {
  if (!media || media.usageStatus !== 'approved') return false;
  if (['unverified', 'pending_release', 'restricted'].includes(media.rightsStatus)) return false;
  return true;
}

export function isCatalogProductMedia(media) {
  if (!isEditorialSiteMedia(media)) return false;
  if (media.category !== 'apparel_product') return true;
  return media.productAccuracyStatus === 'accurate';
}

export function siteReadySourceIds() {
  return [...SITE_READY_SOURCE_IDS];
}
