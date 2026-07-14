const SHIRT_IMAGES = [
  'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?q=85&w=1000&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1581655353564-df123a1eb820?q=85&w=1000&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?q=85&w=1000&auto=format&fit=crop'
];

export const DESIGNS = [
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

const apparelEntries = DESIGNS.flatMap((design, index) => Object.entries(AUDIENCES).map(([audience, config]) => {
  const id = `c1-${design.id}-${audience}`;
  return [id, {
    id,
    sku: `IZHE-C1-${design.id.toUpperCase().replaceAll('-', '_')}-${audience.toUpperCase()}`,
    name: `${design.divineName} — IZHE ${design.message} — ${config.label}`,
    shortName: `${design.divineName} — ${design.message}`,
    description: `Collection 1 shirt inspired by chapter ${design.chapter}: ${design.divineName} — ${design.message}`,
    productType: 'apparel',
    collection: 'collection_1',
    chapter: design.chapter,
    divineName: design.divineName,
    message: design.message,
    audience,
    audienceLabel: config.label,
    unitAmount: config.price,
    lookupKey: `izhe_c1_${design.id.replaceAll('-', '_')}_${audience}_usd`,
    fits: config.fits,
    sizes: config.sizes,
    giveOneEligible: true,
    giveOneUnitsPerPaidUnit: 1,
    image: SHIRT_IMAGES[index % SHIRT_IMAGES.length]
  }];
}));

export const CATALOG = Object.fromEntries([
  ...apparelEntries,
  ['c1-book', {
    id: 'c1-book',
    sku: 'IZHE-C1-BOOK',
    name: 'Who Is God to You? — Discovering God Through His Names — Collection 1',
    shortName: 'Who Is God to You?',
    description: 'The physical companion book anchoring Collection 1 through twelve biblical names and titles of God.',
    productType: 'book',
    collection: 'collection_1',
    unitAmount: 2200,
    lookupKey: 'izhe_c1_book_physical_usd',
    fits: [],
    sizes: [],
    giveOneEligible: false,
    giveOneUnitsPerPaidUnit: 0,
    image: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?q=85&w=1000&auto=format&fit=crop'
  }]
]);

export function normalizeCart(input) {
  if (!Array.isArray(input) || input.length === 0 || input.length > 20) {
    throw new Error('Your cart is empty or contains too many items.');
  }

  const merged = new Map();
  for (const raw of input) {
    const product = CATALOG[String(raw?.productId || '')];
    const quantity = Number(raw?.quantity);
    if (!product) throw new Error('A product in your cart is no longer available.');
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
      throw new Error('Each cart quantity must be between 1 and 10.');
    }

    let fit = '';
    let size = '';
    if (product.productType === 'apparel') {
      fit = String(raw?.fit || '').trim();
      size = String(raw?.size || '').trim().toUpperCase();
      const validFit = product.fits.find((candidate) => candidate.toLowerCase() === fit.toLowerCase());
      if (!validFit) throw new Error(`Select a valid fit for ${product.name}.`);
      if (!product.sizes.includes(size)) throw new Error(`Select a valid size for ${product.name}.`);
      fit = validFit;
    }

    const key = `${product.id}:${fit}:${size}`;
    const existing = merged.get(key);
    const nextQuantity = (existing?.quantity || 0) + quantity;
    if (nextQuantity > 10) throw new Error('A single variant cannot exceed a quantity of 10.');
    merged.set(key, { productId: product.id, fit, size, quantity: nextQuantity });
  }
  return [...merged.values()];
}

export function cartTotal(cart) {
  return cart.reduce((sum, item) => sum + CATALOG[item.productId].unitAmount * item.quantity, 0);
}
