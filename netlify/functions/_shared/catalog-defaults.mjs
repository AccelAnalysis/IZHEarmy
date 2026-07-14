const now = '2026-07-14T00:00:00.000Z';

export const DEFAULT_COLLECTIONS = [
  {
    id: 'collection_1',
    slug: 'collection-1',
    title: 'The God Who Is.',
    shortTitle: 'Collection 1',
    subtitle: 'Who Is God to You? — Discovering God Through His Names',
    description: 'Premium apparel created to make people ask, “What does that mean?” Each eligible shirt includes one Give One claim.',
    bookTitle: 'Who Is God to You?',
    bookSubtitle: 'Discovering God Through His Names',
    status: 'published',
    availabilityStatus: 'available',
    availableFrom: '',
    availableUntil: '',
    displayOrder: 1,
    heroImage: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?q=85&w=1600&auto=format&fit=crop',
    createdAt: now,
    updatedAt: now
  }
];

const SHIRT_IMAGES = [
  'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?q=85&w=1200&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1581655353564-df123a1eb820?q=85&w=1200&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?q=85&w=1200&auto=format&fit=crop'
];

export const DEFAULT_DESIGNS = [
  { id: 'yhwh', chapter: 1, divineName: 'YHWH', message: 'The One Who Is?' },
  { id: 'iam', chapter: 2, divineName: 'I AM', message: 'Still I AM?' },
  { id: 'elohim', chapter: 3, divineName: 'Elohim', message: 'Your Creator?' },
  { id: 'el', chapter: 4, divineName: 'El', message: 'Mighty Enough?' },
  { id: 'adonai', chapter: 5, divineName: 'Adonai', message: 'Your Lord?' },
  { id: 'shaddai', chapter: 6, divineName: 'Shaddai', message: 'Enough?' },
  { id: 'el-shaddai', chapter: 7, divineName: 'El Shaddai', message: 'God Almighty?' },
  { id: 'yhwh-tsevaot', chapter: 8, divineName: 'YHWH Tsevaot', message: 'Fighting For You?' },
  { id: 'holy-one', chapter: 9, divineName: 'The Holy One', message: 'Holy?' },
  { id: 'living-god', chapter: 10, divineName: 'The Living God', message: 'Alive?' },
  { id: 'most-high', chapter: 11, divineName: 'Most High', message: 'Above All?' },
  { id: 'lord-of-lords', chapter: 12, divineName: 'Lord of Lords', message: 'Lord Over Lords?' }
];

const AUDIENCES = {
  adult: {
    label: 'Adult',
    price: 3700,
    sizes: ['S', 'M', 'L', 'XL', '2XL', '3XL'],
    fits: ['Men', 'Women']
  },
  kids: {
    label: 'Kids',
    price: 2700,
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    fits: ['Boys', 'Girls']
  }
};

function variantId(fit, size) {
  return `${fit}-${size}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const apparel = DEFAULT_DESIGNS.flatMap((design, index) => Object.entries(AUDIENCES).map(([audience, config]) => {
  const id = `c1-${design.id}-${audience}`;
  const baseSku = `IZHE-C1-${design.id.toUpperCase().replaceAll('-', '_')}-${audience.toUpperCase()}`;
  return {
    id,
    collectionId: 'collection_1',
    displayGroup: `c1-${design.id}`,
    displayOrder: design.chapter,
    sku: baseSku,
    name: `${design.divineName} — IZHE ${design.message} — ${config.label}`,
    shortName: `${design.divineName} — ${design.message}`,
    description: `Collection 1 shirt inspired by chapter ${design.chapter}: ${design.divineName} — ${design.message}`,
    productType: 'apparel',
    chapter: design.chapter,
    divineName: design.divineName,
    message: design.message,
    audience,
    audienceLabel: config.label,
    unitAmount: config.price,
    currency: 'usd',
    lookupKey: `izhe_c1_${design.id.replaceAll('-', '_')}_${audience}_usd`,
    giveOneEligible: true,
    giveOneUnitsPerPaidUnit: 1,
    status: 'published',
    availabilityStatus: 'available',
    availableFrom: '',
    availableUntil: '',
    featured: design.chapter <= 3,
    images: [{
      id: `default-${design.id}`,
      url: SHIRT_IMAGES[index % SHIRT_IMAGES.length],
      alt: `Lifestyle apparel image for ${design.divineName} — IZHE ${design.message}`,
      role: 'primary',
      displayOrder: 1
    }],
    variants: config.fits.flatMap((fit) => config.sizes.map((size) => ({
      id: variantId(fit, size),
      fit,
      size,
      color: 'Standard',
      sku: `${baseSku}-${fit.toUpperCase()}-${size}`.replaceAll(' ', '_'),
      status: 'active',
      availabilityStatus: 'available'
    }))),
    createdAt: now,
    updatedAt: now
  };
}));

export const DEFAULT_PRODUCTS = [
  ...apparel,
  {
    id: 'c1-book',
    collectionId: 'collection_1',
    displayGroup: 'c1-book',
    displayOrder: 99,
    sku: 'IZHE-C1-BOOK',
    name: 'Who Is God to You? — Discovering God Through His Names — Collection 1',
    shortName: 'Who Is God to You?',
    description: 'The physical companion book anchoring Collection 1 through twelve biblical names and titles of God.',
    productType: 'book',
    chapter: null,
    divineName: '',
    message: '',
    audience: 'all',
    audienceLabel: 'Book',
    unitAmount: 2200,
    currency: 'usd',
    lookupKey: 'izhe_c1_book_physical_usd',
    giveOneEligible: false,
    giveOneUnitsPerPaidUnit: 0,
    status: 'published',
    availabilityStatus: 'available',
    availableFrom: '',
    availableUntil: '',
    featured: true,
    images: [{
      id: 'default-c1-book',
      url: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?q=85&w=1200&auto=format&fit=crop',
      alt: 'Who Is God to You? companion book',
      role: 'primary',
      displayOrder: 1
    }],
    variants: [],
    createdAt: now,
    updatedAt: now
  }
];

export const DEFAULT_CATALOG = {
  schemaVersion: 1,
  revision: 1,
  updatedAt: now,
  collections: DEFAULT_COLLECTIONS,
  products: DEFAULT_PRODUCTS
};
