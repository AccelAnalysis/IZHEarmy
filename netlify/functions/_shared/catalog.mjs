import { DEFAULT_DESIGNS, DEFAULT_PRODUCTS } from './catalog-defaults.mjs';
import { findVariant, isPurchasable, isVariantPurchasable } from './catalog-rules.mjs';

export const DESIGNS = DEFAULT_DESIGNS;
export const CATALOG = Object.fromEntries(DEFAULT_PRODUCTS.map((product) => [product.id, product]));

export function normalizeCart(input, products = DEFAULT_PRODUCTS) {
  if (!Array.isArray(input) || input.length === 0 || input.length > 20) {
    throw new Error('Your cart is empty or contains too many items.');
  }

  const catalog = new Map(products.map((product) => [product.id, product]));
  const merged = new Map();
  for (const raw of input) {
    const product = catalog.get(String(raw?.productId || ''));
    const quantity = Number(raw?.quantity);
    if (!product || !isPurchasable(product)) throw new Error('A product in your cart is no longer available.');
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
      throw new Error('Each cart quantity must be between 1 and 10.');
    }

    let variantId = '';
    let fit = '';
    let size = '';
    let color = '';
    if (product.productType === 'apparel') {
      const variant = findVariant(product, raw);
      if (!variant || !isVariantPurchasable(variant)) throw new Error(`Select an available size and fit for ${product.name}.`);
      variantId = variant.id;
      fit = variant.fit;
      size = variant.size;
      color = variant.color || '';
    }

    const key = `${product.id}:${variantId}`;
    const existing = merged.get(key);
    const nextQuantity = (existing?.quantity || 0) + quantity;
    if (nextQuantity > 10) throw new Error('A single variant cannot exceed a quantity of 10.');
    merged.set(key, { productId: product.id, variantId, fit, size, color, quantity: nextQuantity });
  }
  return [...merged.values()];
}

export function cartTotal(cart, products = DEFAULT_PRODUCTS) {
  const catalog = new Map(products.map((product) => [product.id, product]));
  return cart.reduce((sum, item) => sum + (catalog.get(item.productId)?.unitAmount || 0) * item.quantity, 0);
}
