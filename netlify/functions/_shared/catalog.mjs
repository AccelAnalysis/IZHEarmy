export const CATALOG = {
  core: {
    id: 'core',
    sku: 'IZHE-CORE',
    name: 'Core IZHE Logo Tee',
    description: 'Premium heavyweight tee in Midnight Black.',
    color: 'Midnight Black',
    unitAmount: 3500,
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?q=85&w=1000&auto=format&fit=crop'
  },
  'one-who-is': {
    id: 'one-who-is',
    sku: 'IZHE-ONE-WHO-IS',
    name: 'The One Who Is? Tee',
    description: 'Collection 1 teaching tee in Stone White.',
    color: 'Stone White',
    unitAmount: 3500,
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    image: 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?q=85&w=1000&auto=format&fit=crop'
  },
  'still-i-am': {
    id: 'still-i-am',
    sku: 'IZHE-STILL-I-AM',
    name: 'Still I AM? Tee',
    description: 'Testimony statement tee in Charcoal Heather.',
    color: 'Charcoal Heather',
    unitAmount: 3500,
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    image: 'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?q=85&w=1000&auto=format&fit=crop'
  }
};

export function normalizeCart(input) {
  if (!Array.isArray(input) || input.length === 0 || input.length > 20) {
    throw new Error('Your cart is empty or contains too many items.');
  }

  const merged = new Map();
  for (const raw of input) {
    const product = CATALOG[String(raw?.productId || '')];
    const size = String(raw?.size || '').toUpperCase();
    const quantity = Number(raw?.quantity);
    if (!product) throw new Error('A product in your cart is no longer available.');
    if (!product.sizes.includes(size)) throw new Error(`Select a valid size for ${product.name}.`);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) throw new Error('Each cart quantity must be between 1 and 10.');
    const key = `${product.id}:${size}`;
    const existing = merged.get(key);
    const nextQuantity = (existing?.quantity || 0) + quantity;
    if (nextQuantity > 10) throw new Error('A single size cannot exceed a quantity of 10.');
    merged.set(key, { productId: product.id, size, quantity: nextQuantity });
  }
  return [...merged.values()];
}

export function cartTotal(cart) {
  return cart.reduce((sum, item) => sum + CATALOG[item.productId].unitAmount * item.quantity, 0);
}
