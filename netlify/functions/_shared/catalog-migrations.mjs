export const STAPLE_PLACEHOLDER_MIGRATION_ID = '2026-08-10-staple-collection-placeholders-v1';
export const SUPPORT_ELIGIBILITY_MIGRATION_ID = '2026-08-11-explicit-support-eligibility-v1';

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
    supportEligible: true,
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

function migrateSupportEligibility(catalog, appliedMigrations) {
  if (appliedMigrations.includes(SUPPORT_ELIGIBILITY_MIGRATION_ID)) return { catalog, changed: false, applied: [] };
  let changed = false;
  const products = (catalog.products || []).map((product) => {
    if (typeof product.supportEligible === 'boolean') return product;
    changed = true;
    return {
      ...product,
      // Bounded rule for the existing catalogue: currently approved apparel that already carries
      // the Give One shirt promise is support eligible. Books and all other products default false.
      supportEligible: product.productType === 'apparel' && Boolean(product.giveOneEligible)
    };
  });
  return {
    catalog: {
      ...catalog,
      products,
      appliedMigrations: [...appliedMigrations, SUPPORT_ELIGIBILITY_MIGRATION_ID]
    },
    changed: true,
    applied: [SUPPORT_ELIGIBILITY_MIGRATION_ID]
  };
}

export function applyCatalogMigrations(inputCatalog, { now = new Date().toISOString() } = {}) {
  const input = inputCatalog || {};
  const initialApplied = Array.isArray(input.appliedMigrations)
    ? [...new Set(input.appliedMigrations.map((value) => String(value).trim()).filter(Boolean))]
    : [];

  const support = migrateSupportEligibility({ ...input, appliedMigrations: initialApplied }, initialApplied);
  let catalog = support.catalog;
  let changed = support.changed;
  const applied = [...support.applied];
  const addedProductIds = [];
  const conflicts = [];
  const appliedMigrations = Array.isArray(catalog.appliedMigrations) ? [...catalog.appliedMigrations] : [];

  if (appliedMigrations.includes(STAPLE_PLACEHOLDER_MIGRATION_ID)) {
    return { catalog, changed, applied, addedProductIds, conflicts };
  }

  const collection = findStapleCollection(catalog);
  if (!collection) return { catalog, changed, applied, addedProductIds, conflicts };

  const products = Array.isArray(catalog.products) ? catalog.products : [];
  const productIds = new Set(products.map((product) => product.id));
  const lookupKeys = new Set(products.map((product) => product.lookupKey));
  const targetProducts = products.filter((product) => product.collectionId === collection.id);
  let displayOrder = Math.max(0, ...targetProducts.map((product) => Number(product.displayOrder || 0)));
  const additions = [];

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

  if (conflicts.length) return { catalog: input, changed: false, applied: [], addedProductIds: [], conflicts };

  catalog = {
    ...catalog,
    appliedMigrations: [...appliedMigrations, STAPLE_PLACEHOLDER_MIGRATION_ID],
    products: [...products, ...additions]
  };
  changed = true;
  applied.push(STAPLE_PLACEHOLDER_MIGRATION_ID);
  addedProductIds.push(...additions.map((product) => product.id));

  return { catalog, changed, applied, addedProductIds, conflicts };
}
