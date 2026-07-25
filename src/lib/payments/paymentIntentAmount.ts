export type PaymentIntentAmountSnapshot = {
  amount: number;
  status: string;
};

export type PaymentIntentAmountAction =
  | { action: "keep" }
  | { action: "cancel_and_replace" }
  | { action: "replace_cancelled" }
  | { action: "reject_captured" }
  | { action: "reject_status"; status: string };

const CANCELLABLE_PAYMENT_INTENT_STATUSES = new Set([
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
  "processing",
  "requires_capture",
]);

export function getPaymentIntentAmountAction(
  intent: PaymentIntentAmountSnapshot,
  authoritativeAmountCents: number,
): PaymentIntentAmountAction {
  if (intent.status === "succeeded") return { action: "reject_captured" };
  if (intent.amount === authoritativeAmountCents) return { action: "keep" };
  if (intent.status === "canceled") return { action: "replace_cancelled" };
  if (CANCELLABLE_PAYMENT_INTENT_STATUSES.has(intent.status)) {
    return { action: "cancel_and_replace" };
  }
  return { action: "reject_status", status: intent.status };
}
