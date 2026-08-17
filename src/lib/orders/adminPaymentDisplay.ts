export type AdminPaymentDisplayOrder = {
  payment_intent_id?: string | null;
  stripe_payment_intent_status?: string | null;
  stripe_authorized_amount_cents?: number | null;
  stripe_captured_amount_cents?: number | null;
};

export type AdminPaymentDisplay = {
  authorizedAmountCents: number | null;
  capturedAmountCents: number | null;
};

function hasPaymentIntent(order: AdminPaymentDisplayOrder): boolean {
  return Boolean(order.payment_intent_id?.trim());
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/** Only Stripe-sourced amounts may be labeled as authorized or captured. */
export function getAdminPaymentDisplay(
  order: AdminPaymentDisplayOrder,
): AdminPaymentDisplay {
  if (!hasPaymentIntent(order)) {
    return { authorizedAmountCents: null, capturedAmountCents: null };
  }

  const stripeStatus = order.stripe_payment_intent_status?.trim().toLowerCase();
  const authorizedAmountCents =
    stripeStatus === "requires_capture" || stripeStatus === "succeeded"
      ? isPositiveInteger(order.stripe_authorized_amount_cents)
        ? order.stripe_authorized_amount_cents
        : null
      : null;
  const capturedAmountCents =
    stripeStatus === "succeeded" &&
    isPositiveInteger(order.stripe_captured_amount_cents)
      ? order.stripe_captured_amount_cents
      : null;

  return { authorizedAmountCents, capturedAmountCents };
}
