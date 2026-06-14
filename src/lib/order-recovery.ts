import { createHmac, randomBytes } from "crypto";

export const ORDER_RESUME_TOKEN_TTL_MINUTES = 60;
export const ORDER_RESUME_TOKEN_TTL_MS =
  ORDER_RESUME_TOKEN_TTL_MINUTES * 60 * 1000;

type JsonObject = Record<string, unknown>;

export type RecoverableOrder = {
  id: string;
  status: string | null;
  rx?: unknown;
  rx_upload_path?: string | null;
  rx_source?: string | null;
  verification_status?: string | null;
  payment_intent_id?: string | null;
  shipping_email?: string | null;
  shipping_first_name?: string | null;
  shipping_last_name?: string | null;
  shipping_address1?: string | null;
  shipping_city?: string | null;
  shipping_state?: string | null;
  shipping_zip?: string | null;
  sku?: string | null;
  total_amount_cents?: number | null;
};

export type ResumeDestination = {
  step: "cart" | "checkout";
  path: string;
};

function getRecoverySecret(): string {
  return (
    process.env.ORDER_RESUME_TOKEN_SECRET ||
    process.env.GUEST_ORDER_COOKIE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "local-dev-order-resume-secret"
  );
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null;
}

export function normalizeRecoveryEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isLikelyEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function createOrderResumeToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashOrderResumeToken(token: string): string {
  return createHmac("sha256", getRecoverySecret())
    .update(token)
    .digest("hex");
}

export function getOrderResumeExpiry(): string {
  return new Date(Date.now() + ORDER_RESUME_TOKEN_TTL_MS).toISOString();
}

export function hasRecoverableRx(order: RecoverableOrder): boolean {
  if (order.rx_upload_path || order.rx_source === "upload") return true;

  if (!isObject(order.rx)) return false;
  const right = order.rx.right;
  const left = order.rx.left;

  return Boolean(isObject(right) || isObject(left));
}

export function hasRecoverableShipping(order: RecoverableOrder): boolean {
  return Boolean(
    order.shipping_email?.trim() &&
      order.shipping_first_name?.trim() &&
      order.shipping_last_name?.trim() &&
      order.shipping_address1?.trim() &&
      order.shipping_city?.trim() &&
      order.shipping_state?.trim() &&
      order.shipping_zip?.trim(),
  );
}

export function getResumeDestination(
  order: RecoverableOrder,
): ResumeDestination | null {
  if (!order.id || order.status !== "draft") return null;

  if (order.payment_intent_id || hasRecoverableShipping(order)) {
    return {
      step: "checkout",
      path: `/checkout?orderId=${encodeURIComponent(order.id)}`,
    };
  }

  if (hasRecoverableRx(order) || order.sku || order.total_amount_cents) {
    return { step: "cart", path: "/cart" };
  }

  return null;
}

export function isRecoverableOrder(order: RecoverableOrder): boolean {
  return Boolean(getResumeDestination(order));
}
