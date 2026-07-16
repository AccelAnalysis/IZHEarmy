export const MEDIA_CATEGORIES = [
  'brand_mark',
  'model_lifestyle',
  'apparel_product',
  'book',
  'teaching',
  'church',
  'give_one',
  'campaign',
  'social',
  'general'
];

export const MEDIA_USAGE_STATUSES = ['draft', 'approved', 'restricted', 'archived'];
export const MEDIA_RIGHTS_STATUSES = ['unverified', 'pending_release', 'release_on_file', 'owned_no_people', 'licensed', 'restricted'];
export const MEDIA_PRODUCT_ACCURACY_STATUSES = ['not_applicable', 'review_required', 'accurate', 'concept_only', 'legacy_or_unverified', 'retired_product', 'restricted'];
export const MEDIA_FOCAL_POINTS = ['center', 'top', 'bottom', 'left', 'right', 'top_left', 'top_right', 'bottom_left', 'bottom_right'];
export const MEDIA_ORIENTATIONS = ['portrait', 'landscape', 'square', 'unknown'];

const clean = (value, max = 1000) => String(value ?? '').trim().slice(0, max);
const choice = (value, choices, fallback) => choices.includes(value) ? value : fallback;

function cleanTags(value) {
  const input = Array.isArray(value) ? value : String(value ?? '').split(',');
  return [...new Set(input.map((item) => clean(item, 60).toLowerCase().replace(/\s+/g, '-')).filter(Boolean))].slice(0, 30);
}

function dimension(value) {
  const number = Math.round(Number(value || 0));
  return Number.isFinite(number) && number >= 0 && number <= 50000 ? number : 0;
}

function inferredOrientation(width, height, requested = '') {
  if (MEDIA_ORIENTATIONS.includes(requested) && requested !== 'unknown') return requested;
  if (!width || !height) return 'unknown';
  const ratio = width / height;
  if (ratio >= 0.9 && ratio <= 1.1) return 'square';
  return ratio > 1 ? 'landscape' : 'portrait';
}

export function validateMediaMetadata(input = {}, existing = {}) {
  const width = dimension(input.width ?? existing.width);
  const height = dimension(input.height ?? existing.height);
  const now = new Date().toISOString();
  const alt = clean(input.alt ?? existing.alt, 240);
  if (!alt) throw new Error('Accessible alt text is required for every media asset.');
  return {
    title: clean(input.title ?? existing.title ?? input.filename ?? existing.filename, 180),
    alt,
    category: choice(input.category, MEDIA_CATEGORIES, existing.category || 'general'),
    usageStatus: choice(input.usageStatus, MEDIA_USAGE_STATUSES, existing.usageStatus || 'draft'),
    rightsStatus: choice(input.rightsStatus, MEDIA_RIGHTS_STATUSES, existing.rightsStatus || 'unverified'),
    productAccuracyStatus: choice(input.productAccuracyStatus, MEDIA_PRODUCT_ACCURACY_STATUSES, existing.productAccuracyStatus || 'review_required'),
    tags: cleanTags(input.tags ?? existing.tags),
    credit: clean(input.credit ?? existing.credit, 240),
    notes: clean(input.notes ?? existing.notes, 2000),
    recommendedUse: clean(input.recommendedUse ?? existing.recommendedUse, 1200),
    focalPoint: choice(input.focalPoint, MEDIA_FOCAL_POINTS, existing.focalPoint || 'center'),
    width,
    height,
    orientation: inferredOrientation(width, height, input.orientation || existing.orientation),
    sourceType: clean(input.sourceType ?? existing.sourceType ?? 'admin_upload', 80),
    sourceOriginalPath: clean(input.sourceOriginalPath ?? existing.sourceOriginalPath, 500),
    technicalQuality: clean(input.technicalQuality ?? existing.technicalQuality, 80),
    cropPotential: clean(input.cropPotential ?? existing.cropPotential, 1000),
    createdAt: existing.createdAt || clean(input.createdAt, 80) || now,
    updatedAt: now
  };
}

export function mediaMayBePublished(media) {
  if (!media || media.usageStatus !== 'approved') return false;
  if (['unverified', 'pending_release', 'restricted'].includes(media.rightsStatus)) return false;
  if (['review_required', 'concept_only', 'legacy_or_unverified', 'restricted'].includes(media.productAccuracyStatus) && media.category === 'apparel_product') return false;
  return true;
}
