export type PaymentLifecycleStatus =
  | "draft"
  | "authorized"
  | "captured"
  | "refunded"
  | "cancelled"
  | "failed";

export type PaymentProjectionFallback =
  | "strict"
  | "intent_authorized"
  | "status_authorized";

export type PaymentProjectionSource =
  | "stripe"
  | "local_stripe_status"
  | "order_fallback"
  | "missing_intent";

export type PaymentStateOrder = {
  status?: string | null;
  payment_status?: string | null;
  payment_intent_id?: string | null;
  stripe_payment_intent_status?: string | null;
};

export type StripeChargeSnapshot = {
  refunded?: boolean | null;
  amount_refunded?: number | null;
};

export type StripePaymentIntentSnapshot = {
  status?: string | null;
  latest_charge?: string | StripeChargeSnapshot | null;
};

export type PaymentStateProjection = {
  status: PaymentLifecycleStatus;
  source: PaymentProjectionSource;
  stripePaymentIntentStatus: string | null;
};

export type ProjectPaymentStateOptions = {
  stripeIntent?: StripePaymentIntentSnapshot | null;
  fallback?: PaymentProjectionFallback;
};

const LOCAL_PAYMENT_STATUSES = new Set<PaymentLifecycleStatus>([
  "authorized",
  "captured",
  "refunded",
  "failed",
  "cancelled",
]);

const CUSTOMER_BLOCKED_PAYMENT_INTENT_STATUSES = new Set([
  "incomplete",
  "open",
  "unpaid",
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
  "requires_source",
  "requires_source_action",
  "processing",
  "canceled",
]);

function normalizeText(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function normalizeLocalPaymentStatus(
  value: string | null | undefined,
): PaymentLifecycleStatus | null {
  const status = normalizeText(value);
  if (status === "canceled") return "cancelled";
  return LOCAL_PAYMENT_STATUSES.has(status as PaymentLifecycleStatus)
    ? (status as PaymentLifecycleStatus)
    : null;
}

function latestChargeSnapshot(
  intent: StripePaymentIntentSnapshot,
): StripeChargeSnapshot | null {
  const charge = intent.latest_charge;
  return charge && typeof charge !== "string" ? charge : null;
}

function statusFromStripeIntent(
  intent: StripePaymentIntentSnapshot,
): PaymentLifecycleStatus {
  const charge = latestChargeSnapshot(intent);
  const amountRefunded = charge?.amount_refunded ?? 0;
  const status = normalizeText(intent.status);

  if (charge?.refunded || amountRefunded > 0) return "refunded";
  if (status === "succeeded") return "captured";
  if (status === "requires_capture") return "authorized";
  if (status === "canceled") return "cancelled";
  if (CUSTOMER_BLOCKED_PAYMENT_INTENT_STATUSES.has(status)) return "draft";

  return "failed";
}

function statusFromLocalStripeStatus(
  status: string | null | undefined,
): PaymentLifecycleStatus | null {
  const stripeStatus = normalizeText(status);

  if (stripeStatus === "requires_capture") return "authorized";
  if (stripeStatus === "succeeded") return "captured";
  if (stripeStatus === "canceled") return "cancelled";
  if (CUSTOMER_BLOCKED_PAYMENT_INTENT_STATUSES.has(stripeStatus)) {
    return "draft";
  }

  return null;
}

function fallbackPaymentStatus(
  order: PaymentStateOrder,
  fallback: PaymentProjectionFallback,
): PaymentLifecycleStatus {
  const localPaymentStatus = normalizeLocalPaymentStatus(order.payment_status);
  const orderStatus = normalizeText(order.status);

  if (localPaymentStatus) return localPaymentStatus;

  if (
    orderStatus === "captured" ||
    orderStatus === "paid" ||
    orderStatus === "shipped" ||
    orderStatus === "completed"
  ) {
    return "captured";
  }

  if (orderStatus === "refunded") return "refunded";
  if (orderStatus === "failed") return "failed";
  if (orderStatus === "cancelled" || orderStatus === "canceled") {
    return "cancelled";
  }
  if (orderStatus === "draft") return "draft";

  if (fallback === "status_authorized" && orderStatus === "authorized") {
    return "authorized";
  }

  if (fallback === "intent_authorized" && order.payment_intent_id) {
    return "authorized";
  }

  return "draft";
}

export function projectPaymentState(
  order: PaymentStateOrder,
  options: ProjectPaymentStateOptions = {},
): PaymentStateProjection {
  const fallback = options.fallback ?? "strict";
  const stripeIntent = options.stripeIntent ?? null;

  if (stripeIntent) {
    return {
      status: statusFromStripeIntent(stripeIntent),
      source: "stripe",
      stripePaymentIntentStatus: normalizeText(stripeIntent.status) || null,
    };
  }

  const localStripeStatus = normalizeText(order.stripe_payment_intent_status);
  const localStripePaymentStatus = statusFromLocalStripeStatus(localStripeStatus);
  if (localStripePaymentStatus) {
    return {
      status: localStripePaymentStatus,
      source: "local_stripe_status",
      stripePaymentIntentStatus: localStripeStatus,
    };
  }

  return {
    status: fallbackPaymentStatus(order, fallback),
    source: order.payment_intent_id ? "order_fallback" : "missing_intent",
    stripePaymentIntentStatus: null,
  };
}

export function isCustomerBlockedPaymentIntentStatus(
  status: string | null | undefined,
): boolean {
  return CUSTOMER_BLOCKED_PAYMENT_INTENT_STATUSES.has(normalizeText(status));
}

export function isPaymentAuthorizedOrCaptured(
  status: PaymentLifecycleStatus,
): boolean {
  return status === "authorized" || status === "captured";
}
