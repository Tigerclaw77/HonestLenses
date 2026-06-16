export const ABANDONMENT_FEEDBACK_CREDIT_CENTS = 1000;
export const ABANDONMENT_FEEDBACK_MIN_CART_CENTS = 30000;

export const ABANDONMENT_FEEDBACK_REASONS = [
  "Just comparing prices",
  "Not ready to order today",
  "Found a lower price elsewhere",
  "Wanted to verify my prescription first",
  "Shipping questions",
  "Checkout issue",
  "Payment issue",
  "Other",
] as const;

export type AbandonmentFeedbackReason =
  (typeof ABANDONMENT_FEEDBACK_REASONS)[number];

type CreditOrder = {
  total_amount_cents?: number | null;
  feedback_credit_cents?: number | null;
};

type PrescriptionOrder = {
  rx?: unknown;
  rx_upload_path?: string | null;
  rx_source?: string | null;
  verification_status?: string | null;
};

export function isAbandonmentFeedbackEnabled(): boolean {
  return process.env.ABANDONMENT_FEEDBACK_EXPERIMENT === "true";
}

export function normalizeFeedbackCreditCents(value: unknown): number {
  return Number.isInteger(value) && typeof value === "number" && value > 0
    ? Math.min(value, ABANDONMENT_FEEDBACK_CREDIT_CENTS)
    : 0;
}

export function getFeedbackAmountDueCents(order: CreditOrder): number {
  const total =
    typeof order.total_amount_cents === "number"
      ? order.total_amount_cents
      : 0;
  const credit = normalizeFeedbackCreditCents(order.feedback_credit_cents);
  return Math.max(0, total - credit);
}

export function isAbandonmentFeedbackReason(
  value: unknown,
): value is AbandonmentFeedbackReason {
  return (
    typeof value === "string" &&
    ABANDONMENT_FEEDBACK_REASONS.includes(
      value as AbandonmentFeedbackReason,
    )
  );
}

export function hasFeedbackExperimentPrescription(
  order: PrescriptionOrder,
): boolean {
  if (order.rx_upload_path) return true;
  if (order.rx_source === "upload" || order.rx_source === "ocr") return true;
  if (
    order.verification_status === "verified" ||
    order.verification_status === "ocr_verified" ||
    order.verification_status === "upload_verified" ||
    order.verification_status === "auto_verified"
  ) {
    return true;
  }

  if (!order.rx || typeof order.rx !== "object") return false;

  const rx = order.rx as Record<string, unknown>;
  return Boolean(rx.right || rx.left);
}

export function isFeedbackExperimentEligibleOrder(
  order: CreditOrder &
    PrescriptionOrder & {
      status?: string | null;
      feedback_survey_completed_at?: string | null;
    },
): boolean {
  return (
    isAbandonmentFeedbackEnabled() &&
    order.status === "draft" &&
    (order.total_amount_cents ?? 0) >= ABANDONMENT_FEEDBACK_MIN_CART_CENTS &&
    normalizeFeedbackCreditCents(order.feedback_credit_cents) === 0 &&
    !order.feedback_survey_completed_at &&
    hasFeedbackExperimentPrescription(order)
  );
}

export function sanitizeFeedbackText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 1000) : null;
}
