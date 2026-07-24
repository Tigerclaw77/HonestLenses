export type CaptureReadinessOrder = {
  payment_intent_id?: string | null;
};

export type CaptureReadinessIntent = {
  id?: string | null;
  status?: string | null;
  authorization_expires_at?: string | number | Date | null;
  capture_before?: string | number | Date | null;
};

export type CaptureReadinessReason =
  | "missing_payment_intent"
  | "missing_intent_snapshot"
  | "requires_capture"
  | "already_captured"
  | "incomplete_payment"
  | "cancelled_payment"
  | "authorization_expired"
  | "not_capturable";

export type CaptureReadiness =
  | {
      canProceed: true;
      shouldCapture: true;
      reason: "requires_capture";
      paymentIntentId: string;
      status: string;
      error: null;
    }
  | {
      canProceed: true;
      shouldCapture: false;
      reason: "already_captured";
      paymentIntentId: string;
      status: string;
      error: null;
    }
  | {
      canProceed: false;
      shouldCapture: false;
      reason: Exclude<
        CaptureReadinessReason,
        "requires_capture" | "already_captured"
      >;
      paymentIntentId: string | null;
      status: string | null;
      error: string;
    };

type CaptureReadinessOptions = {
  now?: Date;
};

const INCOMPLETE_PAYMENT_INTENT_STATUSES = new Set([
  "incomplete",
  "open",
  "unpaid",
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
  "requires_source",
  "requires_source_action",
  "processing",
]);

function normalizeText(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function parseTime(value: string | number | Date | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    const dateTime = value.getTime();
    return Number.isFinite(dateTime) ? dateTime : null;
  }
  if (typeof value === "number") {
    const millis = value > 10_000_000_000 ? value : value * 1000;
    return Number.isFinite(millis) ? millis : null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getAuthorizationExpiry(intent: CaptureReadinessIntent): number | null {
  return (
    parseTime(intent.authorization_expires_at) ??
    parseTime(intent.capture_before)
  );
}

export function getRequiredPaymentIntentId(
  order: CaptureReadinessOrder,
  error = "Missing payment_intent_id",
):
  | { ok: true; paymentIntentId: string }
  | { ok: false; error: string } {
  const paymentIntentId = order.payment_intent_id?.trim();
  if (!paymentIntentId) return { ok: false, error };
  return { ok: true, paymentIntentId };
}

export function getCaptureReadiness(
  order: CaptureReadinessOrder,
  intent: CaptureReadinessIntent | null | undefined,
  options: CaptureReadinessOptions = {},
): CaptureReadiness {
  const requiredPaymentIntent = getRequiredPaymentIntentId(order);
  if (!requiredPaymentIntent.ok) {
    return {
      canProceed: false,
      shouldCapture: false,
      reason: "missing_payment_intent",
      paymentIntentId: null,
      status: null,
      error: requiredPaymentIntent.error,
    };
  }

  if (!intent) {
    return {
      canProceed: false,
      shouldCapture: false,
      reason: "missing_intent_snapshot",
      paymentIntentId: requiredPaymentIntent.paymentIntentId,
      status: null,
      error: "Missing PaymentIntent snapshot",
    };
  }

  const status = normalizeText(intent.status);
  const paymentIntentId = intent.id?.trim() || requiredPaymentIntent.paymentIntentId;

  if (status === "requires_capture") {
    const expiresAt = getAuthorizationExpiry(intent);
    const now = options.now ?? new Date();
    if (expiresAt !== null && expiresAt <= now.getTime()) {
      return {
        canProceed: false,
        shouldCapture: false,
        reason: "authorization_expired",
        paymentIntentId,
        status,
        error: "PaymentIntent authorization has expired",
      };
    }

    return {
      canProceed: true,
      shouldCapture: true,
      reason: "requires_capture",
      paymentIntentId,
      status,
      error: null,
    };
  }

  if (status === "succeeded") {
    return {
      canProceed: true,
      shouldCapture: false,
      reason: "already_captured",
      paymentIntentId,
      status,
      error: null,
    };
  }

  if (status === "canceled") {
    return {
      canProceed: false,
      shouldCapture: false,
      reason: "cancelled_payment",
      paymentIntentId,
      status,
      error: `PaymentIntent is not capturable (status: ${status})`,
    };
  }

  if (INCOMPLETE_PAYMENT_INTENT_STATUSES.has(status)) {
    return {
      canProceed: false,
      shouldCapture: false,
      reason: "incomplete_payment",
      paymentIntentId,
      status,
      error: `PaymentIntent is not capturable (status: ${status})`,
    };
  }

  return {
    canProceed: false,
    shouldCapture: false,
    reason: "not_capturable",
    paymentIntentId,
    status: status || null,
    error: `PaymentIntent is not capturable (status: ${status || "unknown"})`,
  };
}
