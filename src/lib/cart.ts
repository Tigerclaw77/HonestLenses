// src/lib/cart.ts

export type CartItem = {
  stripe_price_id: string;
  quantity: number;
};

/**
 * Cart item retrieval is NOT authoritative yet.
 * Do not use for checkout gating or header logic.
 */
export async function getCartItemsForUser(): Promise<CartItem[]> {
  throw new Error(
    "getCartItemsForUser is not implemented. Use /api/cart/has-items instead."
  );
}

/**
 * ⚠️ DEPRECATED
 * Do not use. Header + checkout must call /api/cart/has-items.
 */
export async function hasCartItems(): Promise<boolean> {
  throw new Error(
    "hasCartItems is deprecated. Use /api/cart/has-items instead."
  );
}
