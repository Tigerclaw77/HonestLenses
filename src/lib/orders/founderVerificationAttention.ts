import { type FounderAlertType } from "@/lib/founderAlertConfig";
import { getVerificationState } from "@/lib/orders/getNextAction";

type PaymentCompleteStatus = "authorized" | "captured" | "completed";

export type FounderVerificationAttentionInput = {
  orderId: string;
  paymentStatus: string | null | undefined;
  verificationStatus: string | null | undefined;
  shippingMethod: string | null | undefined;
  customerName?: string | null;
  customerEmail?: string | null;
  type?: FounderAlertType;
  action?: string;
};

export type FounderVerificationAttention = {
  type: FounderAlertType;
  headline: string;
  detail: string;
  dedupeSuffix: string;
};

function normalized(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function shippingLabel(value: string | null | undefined): "STANDARD" | "EXPRESS" {
  return normalized(value) === "express" ? "EXPRESS" : "STANDARD";
}

function paymentLabel(status: PaymentCompleteStatus): string {
  return status === "authorized"
    ? "PAYMENT AUTHORIZED"
    : status === "captured"
      ? "PAYMENT CAPTURED"
      : "ORDER COMPLETED";
}

/**
 * Produces a non-PHI founder alert only after payment has become actionable
 * while prescription verification is still incomplete. Its state-based key
 * makes browser retries and webhook recovery idempotent.
 */
export function getFounderVerificationAttention(
  input: FounderVerificationAttentionInput,
): FounderVerificationAttention | null {
  const paymentStatus = normalized(input.paymentStatus);
  if (!(["authorized", "captured", "completed"] as const).includes(
    paymentStatus as PaymentCompleteStatus,
  )) {
    return null;
  }
  if (getVerificationState({ verification_status: input.verificationStatus }).complete) {
    return null;
  }

  const shipping = shippingLabel(input.shippingMethod);
  const action = input.action ?? "Prescription verification is still pending.";
  const customer = [input.customerName?.trim(), input.customerEmail?.trim()]
    .filter(Boolean)
    .join(" · ");

  return {
    type: input.type ?? "verification_attention_required",
    headline: `${paymentLabel(paymentStatus as PaymentCompleteStatus)} — VERIFICATION PENDING — SHIPPING: ${shipping}`,
    detail: [
      `SHIPPING: ${shipping}.`,
      customer ? `Customer: ${customer}.` : "Customer identity is available in the secure Order Work Queue.",
      action,
    ].join(" "),
    dedupeSuffix: `payment-${paymentStatus}-verification-${normalized(input.verificationStatus) || "pending"}`,
  };
}
