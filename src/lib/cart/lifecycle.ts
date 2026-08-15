export const ACTIVE_CART_ORDER_STATUS = "draft" as const;
export const CART_RECENCY_WINDOW_MS = 1000 * 60 * 60 * 2;

type CartLifecycleOrder = {
  status: string | null;
  paymentIntentId?: string | null;
};

type CartRecencyInput = {
  createdAt: string | null;
  updatedAt?: string | null;
  nowMs?: number;
  scopedGuestOrder?: boolean;
};

/**
 * Stripe PaymentIntent creation only initializes checkout. It does not mean
 * the customer paid, so a draft remains their active cart with or without an
 * attached intent. Successful authorization/capture advances the order status
 * and is the boundary that removes it from cart eligibility.
 */
export function isActiveCartOrder({ status }: CartLifecycleOrder): boolean {
  return status === ACTIVE_CART_ORDER_STATUS;
}

/**
 * A signed guest cookie points at one specific order for its own 24-hour TTL,
 * so that scoped cart is not subject to the shorter signed-in draft window.
 */
export function isCartOrderRecent({
  createdAt,
  updatedAt,
  nowMs = Date.now(),
  scopedGuestOrder = false,
}: CartRecencyInput): boolean {
  if (!createdAt) return false;
  if (scopedGuestOrder) return true;

  const timestamp = updatedAt ?? createdAt;
  const parsed = new Date(timestamp).getTime();
  return Number.isFinite(parsed) && nowMs - parsed <= CART_RECENCY_WINDOW_MS;
}
