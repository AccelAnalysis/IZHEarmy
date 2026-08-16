import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import { randomToken } from './_shared/admin-crypto.mjs';
import { readJsonBody, text } from './_shared/admin-request.mjs';
import { cleanId, loadCatalog, saveCatalog, validateProduct } from './_shared/catalog-service.mjs';
import { json } from './_shared/http.mjs';

function uniqueProductId(catalog, sourceId) {
  const base = cleanId(`${sourceId}-copy`) || `product-copy-${randomToken(5).toLowerCase()}`;
  if (!catalog.products.some((product) => product.id === base)) return base;
  for (let index = 2; index < 10_000; index += 1) {
    const candidate = cleanId(`${base}-${index}`);
    if (!catalog.products.some((product) => product.id === candidate)) return candidate;
  }
  throw Object.assign(new Error('A unique duplicate product ID could not be generated.'), { statusCode: 409 });
}

export default adminEndpoint({
  methods: ['POST'],
  permission: 'catalog.products.duplicate',
  csrf: true,
  recentAuth: false,
  auditAction: 'product.duplicate',
  rateClass: 'write',
  contentTypes: ['application/json'],
  maxBodyBytes: 100_000
}, async (request) => {
  const body = await readJsonBody(request);
  const sourceId = text(body.sourceId, 120);
  if (!sourceId) throw Object.assign(new Error('A source product ID is required.'), { statusCode: 400 });
  const { catalog, etag } = await loadCatalog();
  if (body.expectedRevision != null && Number(body.expectedRevision) !== Number(catalog.revision)) {
    throw Object.assign(new Error('The catalog changed in another session. Reload before duplicating.'), { statusCode: 409 });
  }
  const source = catalog.products.find((product) => product.id === sourceId);
  if (!source) throw Object.assign(new Error('The source product no longer exists.'), { statusCode: 404 });
  const targetCollectionId = cleanId(body.targetCollectionId || source.collectionId);
  if (!catalog.collections.some((collection) => collection.id === targetCollectionId)) {
    throw Object.assign(new Error('Select a valid target collection.'), { statusCode: 400 });
  }

  const id = uniqueProductId(catalog, source.id);
  const suffix = randomToken(6).replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toLowerCase();
  const draftSku = `DRAFT-${String(source.sku || source.id).replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 80)}-${suffix}`.slice(0, 120);
  const now = new Date().toISOString();
  const input = structuredClone(source);
  Object.assign(input, {
    id,
    collectionId: targetCollectionId,
    name: `${source.name} (Copy)`.slice(0, 220),
    shortName: `${source.shortName || source.name} (Copy)`.slice(0, 160),
    sku: draftSku,
    lookupKey: `draft_${id.replace(/-/g, '_')}_${suffix}`.slice(0, 180),
    status: 'draft',
    availabilityStatus: 'paused',
    availableFrom: '',
    availableUntil: '',
    createdAt: now,
    updatedAt: now,
    publicationHistory: [],
    publishedAt: null,
    archivedAt: null,
    operationalReferences: []
  });
  input.variants = (source.variants || []).map((variant, index) => ({
    ...structuredClone(variant),
    id: cleanId(`${id}-${variant.fit || 'variant'}-${variant.size || index + 1}-${index + 1}`),
    sku: `${draftSku}-${index + 1}`.slice(0, 120),
    availabilityStatus: 'paused'
  }));
  input.images = (source.images || []).map((image) => structuredClone(image));

  const duplicate = validateProduct(input, catalog.collections);
  const saved = await saveCatalog({ ...catalog, products: [...catalog.products, duplicate] }, etag);
  const created = saved.catalog.products.find((product) => product.id === duplicate.id);
  return {
    response: json({ product: created, catalogRevision: saved.catalog.revision, etag: saved.etag }, 201),
    audit: {
      resourceType: 'product',
      resourceId: created.id,
      beforeSummary: { sourceId: source.id, sourceStatus: source.status, sourceSku: source.sku, sourceLookupKey: '[not copied]' },
      afterSummary: {
        id: created.id,
        collectionId: created.collectionId,
        status: created.status,
        availabilityStatus: created.availabilityStatus,
        skuRegenerated: true,
        lookupKeyRegenerated: true,
        imagesCopied: created.images.length,
        variantsCopied: created.variants.length
      }
    }
  };
});
