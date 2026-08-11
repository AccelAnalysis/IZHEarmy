export const STAPLE_PLACEHOLDER_MIGRATION_ID = '2026-08-10-staple-collection-placeholders-v1';

export const STAPLE_PLACEHOLDER_PRODUCTS = Object.freeze([
  { key: 'is_he_to_you_what_he_is_to_me', skuCode: 'IS-HE-TO-YOU', name: 'Is He to you what He is to me' },
  { key: 'your_friend', skuCode: 'YOUR-FRIEND', name: 'Your Friend' },
  { key: 'your_healer', skuCode: 'YOUR-HEALER', name: 'Your Healer' },
  { key: 'your_provider', skuCode: 'YOUR-PROVIDER', name: 'Your Provider' },
  { key: 'your_protector', skuCode: 'YOUR-PROTECTOR', name: 'Your Protector' },
  { key: 'your_peace', skuCode: 'YOUR-PEACE', name: 'Your Peace' },
  { key: 'your_savior', skuCode: 'YOUR-SAVIOR', name: 'Your Savior' }
]);

const normalizeKey = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
const cleanId = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80);

function findStapleCollection(catalog) {
  return (catalog?.collections || []).find((collection) => [
    collection.id,
    collection.slug,
    collection.title,
    collection.shortTitle
  ].some((value) => normalizeKey(value) === 'staplecollection')) || null;
}

function placeholderVariants(sku) {
  return ['S', 'M', 'L', 'XL', '2XL', '3XL'].map((size) => ({
    id: `unisex-${size.toLowerCase()}`,
    fit: 'Unisex',
    size,
    color: 'Standard',
    sku: `${sku}-UNISEX-${size}`,
    status: 'active',
    availabilityStatus: 'paused'
  }));
}

function placeholderRecord(definition, collection, displayOrder, now) {
  const collectionToken = cleanId(collection.id || collection.slug || 'staple-collection');
  const id = cleanId(`${collectionToken}-${definition.key.replaceAll('_', '-')}`);
  const sku = `IZHE-STAPLE-${definition.skuCode}`;
  return {
    id,
    collectionId: collection.id,
    displayGroup: id,
    displayOrder,
    sku,
    name: definition.name,
    shortName: definition.name,
    description: `Draft placeholder for the Staple Collection “${definition.name}” apparel design. Final artwork, imagery, pricing, Stripe configuration, and production details must be completed before publication.`,
    productType: 'apparel',
    chapter: null,
    divineName: '',
    message: definition.name,
    audience: 'all',
    audienceLabel: 'Unisex',
    unitAmount: 3700,
    currency: 'usd',
    lookupKey: `izhe_${collectionToken.replaceAll('-', '_')}_${definition.key}_placeholder_usd`,
    giveOneEligible: true,
    giveOneUnitsPerPaidUnit: 1,
    status: 'draft',
    availabilityStatus: 'paused',
    availableFrom: '',
    availableUntil: '',
    featured: false,
    images: [],
    variants: placeholderVariants(sku),
    createdAt: now,
    updatedAt: now
  };
}

function matchesPlaceholder(product, collectionId, definition, expected) {
  if (product.collectionId !== collectionId) return false;
  if (product.id === expected.id || product.lookupKey === expected.lookupKey) return true;
  const expectedName = normalizeKey(definition.name);
  return [product.name, product.shortName, product.message].some((value) => normalizeKey(value) === expectedName);
}

export function applyCatalogMigrations(inputCatalog, { now = new Date().toISOString() } = {}) {
  const catalog = inputCatalog || {};
  const appliedMigrations = Array.isArray(catalog.appliedMigrations)
    ? [...new Set(catalog.appliedMigrations.map((value) => String(value).trim()).filter(Boolean))]
    : [];
  if (appliedMigrations.includes(STAPLE_PLACEHOLDER_MIGRATION_ID)) {
    return { catalog, changed: false, applied: [], addedProductIds: [], conflicts: [] };
  }

  const collection = findStapleCollection(catalog);
  if (!collection) return { catalog, changed: false, applied: [], addedProductIds: [], conflicts: [] };

  const products = Array.isArray(catalog.products) ? catalog.products : [];
  const productIds = new Set(products.map((product) => product.id));
  const lookupKeys = new Set(products.map((product) => product.lookupKey));
  const targetProducts = products.filter((product) => product.collectionId === collection.id);
  let displayOrder = Math.max(0, ...targetProducts.map((product) => Number(product.displayOrder || 0)));
  const additions = [];
  const conflicts = [];

  for (const definition of STAPLE_PLACEHOLDER_PRODUCTS) {
    const expected = placeholderRecord(definition, collection, displayOrder + 1, now);
    if (products.some((product) => matchesPlaceholder(product, collection.id, definition, expected))) continue;
    if (productIds.has(expected.id) || lookupKeys.has(expected.lookupKey)) {
      conflicts.push({ name: definition.name, id: expected.id, lookupKey: expected.lookupKey });
      continue;
    }
    displayOrder += 1;
    expected.displayOrder = displayOrder;
    additions.push(expected);
    productIds.add(expected.id);
    lookupKeys.add(expected.lookupKey);
  }

  if (conflicts.length) {
    return { catalog, changed: false, applied: [], addedProductIds: [], conflicts };
  }

  return {
    catalog: {
      ...catalog,
      appliedMigrations: [...appliedMigrations, STAPLE_PLACEHOLDER_MIGRATION_ID],
      products: [...products, ...additions]
    },
    changed: true,
    applied: [STAPLE_PLACEHOLDER_MIGRATION_ID],
    addedProductIds: additions.map((product) => product.id),
    conflicts: []
  };
}
