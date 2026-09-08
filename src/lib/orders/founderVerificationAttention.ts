import { type FounderAlertType } from "@/lib/founderAlertConfig";
import { getVerificationState } from "@/lib/orders/getNextAction";

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

/**
 * Restores the existing founder attention alert for an actionable payment
 * whose prescription verification is incomplete. Completed and non-payment
 * states are deliberately excluded.
 */
export function getFounderVerificationAttention(
  input: FounderVerificationAttentionInput,
): FounderVerificationAttention | null {
  const paymentStatus = normalized(input.paymentStatus);
  if (!(paymentStatus === "authorized" || paymentStatus === "captured")) {
    return null;
  }
  if (
    getVerificationState({ verification_status: input.verificationStatus })
      .complete
  ) {
    return null;
  }

  const shipping = shippingLabel(input.shippingMethod);
  const payment =
    paymentStatus === "authorized" ? "PAYMENT AUTHORIZED" : "PAYMENT CAPTURED";
  const action =
    input.action ?? "Open the secure Order Work Queue to complete prescription verification.";
  const customer = [input.customerName?.trim(), input.customerEmail?.trim()]
    .filter(Boolean)
    .join(" · ");

  return {
    type: input.type ?? "verification_attention_required",
    headline: `${payment} — VERIFICATION PENDING — SHIPPING: ${shipping}`,
    detail: [
      `SHIPPING: ${shipping}.`,
      customer
        ? `Customer: ${customer}.`
        : "Customer identity is available in the secure Order Work Queue.",
      action,
    ].join(" "),
    dedupeSuffix: `payment-${paymentStatus}-verification-${
      normalized(input.verificationStatus) || "pending"
    }`,
  };
}
