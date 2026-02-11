import type { CartOrder } from "./types";

/* =========================
   Types
========================= */

export type CartResponse = {
  hasCart: boolean;
  order?: CartOrder;
};

export type ResolveOkWithOrder = {
  ok: true;
  order: CartOrder;
};

export type ResolveOkFlat = {
  ok: true;
  orderId?: string;
  sku?: string;
  right_box_count?: number | null;
  left_box_count?: number | null;
  box_count?: number | null;
  total_amount_cents?: number | null;
};

export type ResolveErr = {
  ok?: false;
  error: string;
};

/* =========================
   Type Guards
========================= */

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCartOrder(value: unknown): value is CartOrder {
  if (!isObject(value)) return false;

  return (
    typeof value.id === "string" &&
    "rx" in value &&
    "sku" in value &&
    "box_count" in value &&
    "total_amount_cents" in value
  );
}

export function isResolveErr(value: unknown): value is ResolveErr {
  return isObject(value) && typeof value.error === "string";
}

export function isResolveOkWithOrder(
  value: unknown,
): value is ResolveOkWithOrder {
  if (!isObject(value)) return false;
  if (value.ok !== true) return false;
  if (!("order" in value)) return false;

  const order = (value as Record<string, unknown>).order;
  return isCartOrder(order);
}

export function isResolveOkFlat(value: unknown): value is ResolveOkFlat {
  return isObject(value) && value.ok === true;
}

/* =========================
   API calls
========================= */

export async function fetchCart(accessToken: string): Promise<CartOrder | null> {
  const res = await fetch("/api/cart", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!res.ok) return null;

  const body: unknown = await res.json();
  if (!isObject(body)) return null;

  const hasCart = body.hasCart === true;
  const order = (body as CartResponse).order;

  if (!hasCart || !order || !order.rx) return null;
  return order;
}

export async function resolveCart(
  accessToken: string,
  body?: {
    right_box_count: number; // allow 0
    left_box_count: number; // allow 0
    box_count: number; // allow 0
  },
): Promise<CartOrder> {
  const res = await fetch("/api/cart/resolve", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    cache: "no-store",
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    if (isResolveErr(parsed)) throw new Error(parsed.error);
    throw new Error("Cart resolve failed.");
  }

  if (isResolveOkWithOrder(parsed)) return parsed.order;

  if (isResolveOkFlat(parsed)) {
    const refreshed = await fetchCart(accessToken);
    if (!refreshed) throw new Error("Cart missing after resolve.");
    return refreshed;
  }

  throw new Error("Unexpected cart resolve response.");
}
