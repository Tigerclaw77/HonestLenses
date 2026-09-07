import { getResumeDestination, isLikelyEmail, normalizeRecoveryEmail, type RecoverableOrder } from "./order-recovery";

// No send transport exists in this workflow. Activation requires a reviewed change.
export const RECOVERY_DELIVERY_ENABLED = false;
export const RECOVERY_TOUCH_HOURS = [1, 24] as const;
export type RecoveryTouch = (typeof RECOVERY_TOUCH_HOURS)[number];
export type RecoveryOrder = RecoverableOrder & {
  created_at?: string | null;
  updated_at?: string | null;
  email_delivery_status?: string | null;
};
export type RecoveryIntent = {
  id: string; status: string; metadata: { order_id?: string };
  amount_received: number; amount_capturable: number;
};

export function recoveryTouchDue(order: RecoveryOrder, now = new Date()): RecoveryTouch | null {
  if (!getResumeDestination(order) || !isLikelyEmail(normalizeRecoveryEmail(order.shipping_email ?? ""))) return null;
  if (["bounced", "complained", "suppressed", "failed"].includes(order.email_delivery_status ?? "")) return null;
  const activity = Date.parse(order.updated_at ?? order.created_at ?? "");
  const age = now.getTime() - activity;
  // Do not launch a campaign against historical drafts or bunch delayed touches.
  if (!Number.isFinite(age) || age < 3_600_000 || age > 7 * 86_400_000) return null;
  return age >= 86_400_000 ? 24 : 1;
}

export async function verifiedResumeDestination(
  order: RecoverableOrder,
  retrieve: (id: string) => Promise<RecoveryIntent>,
) {
  const destination = getResumeDestination(order);
  if (!destination || !order.payment_intent_id) return destination;
  // A lagging webhook must never turn an authorization/payment into abandonment.
  const intent = await retrieve(order.payment_intent_id);
  if (intent.id !== order.payment_intent_id || intent.metadata.order_id !== order.id ||
      intent.amount_received !== 0 || intent.amount_capturable !== 0) return null;
  return getResumeDestination({ ...order, stripe_payment_intent_status: intent.status });
}
