export type RedirectAuthorizationOrder = {
  id: string;
  payment_intent_id: string | null;
  status: string | null;
  verification_status: string | null;
  total_amount_cents: number | null;
  feedback_credit_cents: number | null;
  rx_upload_path?: string | null;
  rx_status?: string | null;
  prescriber_name?: string | null;
  prescriber_practice?: string | null;
  prescriber_phone?: string | null;
  prescriber_fax?: string | null;
  prescriber_email?: string | null;
  verification_details_submitted_at?: string | null;
};

export type RedirectAuthorizationIntent = {
  id: string;
  status: string;
  amount: number;
  metadata?: { order_id?: string } | null;
};

export type RedirectAuthorizationDecision =
  | { ok: true; idempotent: boolean; next: "success" | "verification-details" }
  | { ok: false; code: string; error: string };

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasVerificationInformation(order: RedirectAuthorizationOrder): boolean {
  return Boolean(
    order.rx_upload_path ||
      (hasText(order.prescriber_name) || hasText(order.prescriber_practice)) &&
        (hasText(order.prescriber_phone) ||
          hasText(order.prescriber_fax) ||
          hasText(order.prescriber_email)),
  );
}

/**
 * Performs only trust and routing decisions. Stripe state is always supplied
 * by a server-side retrieval, never by the browser's redirect parameters.
 */
export function decideRedirectAuthorization({
  order,
  intent,
  expectedAmountCents,
}: {
  order: RedirectAuthorizationOrder;
  intent: RedirectAuthorizationIntent;
  expectedAmountCents: number;
}): RedirectAuthorizationDecision {
  if (!order.payment_intent_id || order.payment_intent_id !== intent.id) {
    return {
      ok: false,
      code: "PAYMENT_INTENT_ORDER_MISMATCH",
      error: "PaymentIntent does not match this order.",
    };
  }

  if (intent.metadata?.order_id !== order.id) {
    return {
      ok: false,
      code: "PAYMENT_INTENT_METADATA_MISMATCH",
      error: "PaymentIntent metadata does not match this order.",
    };
  }

  if (intent.status !== "requires_capture" && intent.status !== "succeeded") {
    return {
      ok: false,
      code: "PAYMENT_NOT_AUTHORIZED",
      error: `Payment is not authorized (status: ${intent.status}).`,
    };
  }

  if (intent.amount !== expectedAmountCents) {
    return {
      ok: false,
      code: "CHECKOUT_AMOUNT_MISMATCH",
      error: "The authorized payment amount does not match this order.",
    };
  }

  const isUploaded = Boolean(order.rx_upload_path);
  const hasDetails = hasVerificationInformation(order);
  const expectedVerificationStatus = isUploaded
    ? order.verification_status
    : hasDetails
      ? "pending"
      : "information_needed";
  const expectedStatus =
    isUploaded && order.rx_status === "auto_verified" && intent.status === "succeeded"
      ? "captured"
      : "authorized";

  return {
    ok: true,
    idempotent:
      order.status === expectedStatus &&
      order.verification_status === expectedVerificationStatus,
    next: isUploaded ? "success" : "verification-details",
  };
}

export function isAuthorizedDraftPaymentIntentStatus(status: string | null | undefined) {
  return status === "requires_capture";
}
