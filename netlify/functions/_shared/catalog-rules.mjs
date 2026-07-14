export function cleanId(value, fallback = '') {
  const id = String(value || fallback).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/(^-|-$)/g, '');
  return id.slice(0, 80);
}

export function primaryImage(product) {
  const images = Array.isArray(product?.images) ? product.images : [];
  return [...images].sort((a, b) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0)).find((image) => image.role === 'primary') || images[0] || null;
}

export function dateAllows(record, now = new Date()) {
  const from = record?.availableFrom ? new Date(record.availableFrom) : null;
  const until = record?.availableUntil ? new Date(record.availableUntil) : null;
  if (from && !Number.isNaN(from.valueOf()) && now < from) return false;
  if (until && !Number.isNaN(until.valueOf()) && now > until) return false;
  return true;
}

export function isPublished(record) {
  return record?.status === 'published';
}

export function isPurchasable(record, now = new Date()) {
  return isPublished(record) && ['available', 'preorder'].includes(record?.availabilityStatus) && dateAllows(record, now);
}

export function isVariantPurchasable(variant) {
  return variant?.status !== 'disabled' && ['available', 'preorder'].includes(variant?.availabilityStatus || 'available');
}

export function findVariant(product, selection = {}) {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  if (!variants.length && product?.productType !== 'apparel') return null;
  const requestedId = String(selection.variantId || '').trim();
  if (requestedId) return variants.find((variant) => variant.id === requestedId) || null;
  const fit = String(selection.fit || '').trim().toLowerCase();
  const size = String(selection.size || '').trim().toUpperCase();
  return variants.find((variant) => String(variant.fit || '').toLowerCase() === fit && String(variant.size || '').toUpperCase() === size) || null;
}

export function collectionIsPublic(collection, now = new Date()) {
  return isPublished(collection) && ['available', 'preorder'].includes(collection?.availabilityStatus || 'available') && dateAllows(collection, now);
}

export function validateCollection(input) {
  const id = cleanId(input?.id || input?.slug || input?.title);
  if (!id) throw new Error('Collection ID is required.');
  const title = String(input?.title || '').trim();
  if (!title) throw new Error('Collection title is required.');
  const status = ['draft', 'published', 'hidden', 'archived'].includes(input?.status) ? input.status : 'draft';
  const availabilityStatus = ['available', 'preorder', 'paused', 'sold_out', 'retired'].includes(input?.availabilityStatus) ? input.availabilityStatus : 'paused';
  return {
    id,
    slug: cleanId(input?.slug || id),
    title: title.slice(0, 160),
    shortTitle: String(input?.shortTitle || title).trim().slice(0, 80),
    subtitle: String(input?.subtitle || '').trim().slice(0, 240),
    description: String(input?.description || '').trim().slice(0, 1200),
    bookTitle: String(input?.bookTitle || '').trim().slice(0, 180),
    bookSubtitle: String(input?.bookSubtitle || '').trim().slice(0, 240),
    status,
    availabilityStatus,
    availableFrom: String(input?.availableFrom || '').trim(),
    availableUntil: String(input?.availableUntil || '').trim(),
    displayOrder: Number.isFinite(Number(input?.displayOrder)) ? Number(input.displayOrder) : 100,
    heroImage: String(input?.heroImage || '').trim().slice(0, 1000),
    createdAt: input?.createdAt || new Date().toISOString(),
    updatedAt: input?.updatedAt || new Date().toISOString()
  };
}

function validateImages(images) {
  if (!Array.isArray(images)) return [];
  return images.slice(0, 12).map((image, index) => ({
    id: cleanId(image?.id || `image-${index + 1}`),
    url: String(image?.url || '').trim().slice(0, 1200),
    alt: String(image?.alt || '').trim().slice(0, 240),
    role: image?.role === 'primary' ? 'primary' : 'gallery',
    displayOrder: Number.isFinite(Number(image?.displayOrder)) ? Number(image.displayOrder) : index + 1
  })).filter((image) => image.url);
}

function validateVariants(variants, baseSku) {
  if (!Array.isArray(variants)) return [];
  return variants.slice(0, 300).map((variant, index) => {
    const fit = String(variant?.fit || '').trim().slice(0, 40);
    const size = String(variant?.size || '').trim().toUpperCase().slice(0, 12);
    const id = cleanId(variant?.id || `${fit}-${size}-${index + 1}`);
    return {
      id,
      fit,
      size,
      color: String(variant?.color || 'Standard').trim().slice(0, 60),
      sku: String(variant?.sku || `${baseSku}-${id}`).trim().slice(0, 120),
      status: variant?.status === 'disabled' ? 'disabled' : 'active',
      availabilityStatus: ['available', 'preorder', 'paused', 'sold_out', 'retired'].includes(variant?.availabilityStatus) ? variant.availabilityStatus : 'available'
    };
  }).filter((variant) => variant.id && variant.size);
}

export function validateProduct(input, collections = []) {
  const id = cleanId(input?.id || input?.sku || input?.name);
  if (!id) throw new Error('Product ID is required.');
  const collectionId = cleanId(input?.collectionId);
  if (!collections.some((collection) => collection.id === collectionId)) throw new Error('Select a valid collection.');
  const name = String(input?.name || '').trim();
  const sku = String(input?.sku || '').trim();
  const lookupKey = String(input?.lookupKey || '').trim();
  if (!name || !sku || !lookupKey) throw new Error('Product name, SKU, and Stripe lookup key are required.');
  const productType = ['apparel', 'book', 'bundle', 'other'].includes(input?.productType) ? input.productType : 'apparel';
  const unitAmount = Number(input?.unitAmount);
  if (!Number.isInteger(unitAmount) || unitAmount < 0 || unitAmount > 10000000) throw new Error('Product price must be a whole number of cents.');
  const status = ['draft', 'published', 'hidden', 'archived'].includes(input?.status) ? input.status : 'draft';
  const availabilityStatus = ['available', 'preorder', 'paused', 'sold_out', 'retired'].includes(input?.availabilityStatus) ? input.availabilityStatus : 'paused';
  const variants = validateVariants(input?.variants, sku);
  if (productType === 'apparel' && variants.length === 0) throw new Error('Apparel products require at least one variant.');
  const images = validateImages(input?.images);
  if (status === 'published' && images.length === 0) throw new Error('Published products require at least one image.');
  if (images.length && !images.some((image) => image.role === 'primary')) images[0].role = 'primary';
  return {
    id,
    collectionId,
    displayGroup: cleanId(input?.displayGroup || id),
    displayOrder: Number.isFinite(Number(input?.displayOrder)) ? Number(input.displayOrder) : 100,
    sku: sku.slice(0, 120),
    name: name.slice(0, 220),
    shortName: String(input?.shortName || name).trim().slice(0, 160),
    description: String(input?.description || '').trim().slice(0, 1600),
    productType,
    chapter: input?.chapter === '' || input?.chapter == null ? null : Number(input.chapter),
    divineName: String(input?.divineName || '').trim().slice(0, 120),
    message: String(input?.message || '').trim().slice(0, 160),
    audience: cleanId(input?.audience || 'all'),
    audienceLabel: String(input?.audienceLabel || input?.audience || 'All').trim().slice(0, 60),
    unitAmount,
    currency: 'usd',
    lookupKey: lookupKey.slice(0, 180),
    giveOneEligible: Boolean(input?.giveOneEligible),
    giveOneUnitsPerPaidUnit: Boolean(input?.giveOneEligible) ? Math.max(1, Math.min(10, Number(input?.giveOneUnitsPerPaidUnit || 1))) : 0,
    status,
    availabilityStatus,
    availableFrom: String(input?.availableFrom || '').trim(),
    availableUntil: String(input?.availableUntil || '').trim(),
    featured: Boolean(input?.featured),
    images,
    variants,
    createdAt: input?.createdAt || new Date().toISOString(),
    updatedAt: input?.updatedAt || new Date().toISOString()
  };
}

export function validateCatalog(catalog) {
  const collections = (catalog?.collections || []).map(validateCollection);
  const ids = new Set();
  for (const collection of collections) {
    if (ids.has(collection.id)) throw new Error(`Duplicate collection ID: ${collection.id}`);
    ids.add(collection.id);
  }
  const products = (catalog?.products || []).map((product) => validateProduct(product, collections));
  const productIds = new Set();
  const lookupKeys = new Set();
  for (const product of products) {
    if (productIds.has(product.id)) throw new Error(`Duplicate product ID: ${product.id}`);
    if (lookupKeys.has(product.lookupKey)) throw new Error(`Duplicate Stripe lookup key: ${product.lookupKey}`);
    productIds.add(product.id);
    lookupKeys.add(product.lookupKey);
  }
  return {
    schemaVersion: 1,
    revision: Number(catalog?.revision || 1),
    updatedAt: catalog?.updatedAt || new Date().toISOString(),
    collections,
    products
  };
}
export function publicCatalog(catalog, { includeDrafts = false, now = new Date() } = {}) {
  const collections = [...catalog.collections]
    .filter((collection) => includeDrafts || collectionIsPublic(collection, now))
    .sort((a, b) => a.displayOrder - b.displayOrder);
  const collectionIds = new Set(collections.map((collection) => collection.id));
  const products = [...catalog.products]
    .filter((product) => collectionIds.has(product.collectionId) && (includeDrafts || isPublished(product)))
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((product) => ({
      ...product,
      isPurchasable: isPurchasable(product, now),
      variants: (product.variants || []).map((variant) => ({ ...variant, isPurchasable: isVariantPurchasable(variant) })),
      primaryImage: primaryImage(product)
    }));
  return {
    schemaVersion: catalog.schemaVersion,
    revision: catalog.revision,
    updatedAt: catalog.updatedAt,
    preview: includeDrafts,
    collections,
    products
  };
}

export function catalogMap(catalog) {
  return new Map((catalog?.products || []).map((product) => [product.id, product]));
}

