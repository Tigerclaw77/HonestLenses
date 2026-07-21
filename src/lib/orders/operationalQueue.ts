import {
  getNextAction,
  getPaymentState,
  getRxSourceState,
  getVerificationState,
  hasEmailDeliveryAttention,
  type Order as NextActionOrder,
  type PaymentLifecycleStatus,
} from "./getNextAction";

export type OperationalQueueBucket =
  | "active_fulfillment"
  | "action_required"
  | "verification_pending"
  | "customer_blocked"
  | "draft_or_test"
  | "history_archive";

export type OperationalQueueClassification = {
  bucket: OperationalQueueBucket;
  operatorActionable: boolean;
  reasons: string[];
  nextActionLabel: string;
  paymentStatus: PaymentLifecycleStatus;
};

export type OperationalQueueOrder = NextActionOrder & {
  id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  admin_notes?: string | null;
  shipping_email?: string | null;
  shipping_first_name?: string | null;
  shipping_last_name?: string | null;
  patient_name?: string | null;
  patient_full_name?: string | null;
  archived?: boolean | null;
  archived_at?: string | null;
  fulfillment_status?: string | null;
  abandoned_checkout?: { isAbandoned?: boolean | null } | null;
};

type FulfillmentStatus =
  | "review"
  | "ready_to_order"
  | "ordered"
  | "shipped"
  | "completed"
  | "hold"
  | "cancelled";

type OperationalQueueOptions = {
  now?: Date;
  recentShippedDays?: number;
};

const DEFAULT_RECENT_SHIPPED_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const CUSTOMER_BLOCKED_NEXT_ACTION_LABELS = new Set([
  "Await checkout",
  "Wait for customer",
]);

const CUSTOMER_BLOCKED_STRIPE_STATUSES = new Set([
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

const NORMAL_FULFILLMENT_ACTIONS = new Set([
  "Capture payment",
  "Place vendor order",
  "Confirm delivery",
]);

function normalizedFulfillmentStatus(
  order: OperationalQueueOrder,
): FulfillmentStatus {
  if (
    order.fulfillment_status === "review" ||
    order.fulfillment_status === "ready_to_order" ||
    order.fulfillment_status === "ordered" ||
    order.fulfillment_status === "shipped" ||
    order.fulfillment_status === "completed" ||
    order.fulfillment_status === "hold" ||
    order.fulfillment_status === "cancelled"
  ) {
    return order.fulfillment_status;
  }

  if (order.status === "completed") return "completed";
  if (order.status === "shipped") return "shipped";
  if (order.status === "cancelled") return "cancelled";
  return "review";
}

function getTimestamp(value: string | null | undefined): number {
  if (!value) return 0;

  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function getActivityTimestamp(order: OperationalQueueOrder): number {
  return getTimestamp(order.updated_at) || getTimestamp(order.created_at);
}

function isWithinDays(
  order: OperationalQueueOrder,
  days: number,
  now: Date,
): boolean {
  const activityTime = getActivityTimestamp(order);
  if (!activityTime) return false;

  return now.getTime() - activityTime <= days * DAY_MS;
}

function normalizedText(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function containsAnyMarker(
  value: string | null | undefined,
  markers: RegExp[],
): boolean {
  const text = normalizedText(value);
  return Boolean(text && markers.some((marker) => marker.test(text)));
}

function isExplicitDraftOrTest(order: OperationalQueueOrder): boolean {
  const statusMarkers = [/^test$/, /^internal$/, /^sandbox$/, /^experiment$/];
  const textMarkers = [/\btest\b/, /\binternal\b/, /\bsandbox\b/, /\bexperiment\b/];

  if (
    containsAnyMarker(order.status, statusMarkers) ||
    containsAnyMarker(order.fulfillment_status, statusMarkers) ||
    containsAnyMarker(order.admin_notes, textMarkers)
  ) {
    return true;
  }

  const customerText = [
    order.shipping_first_name,
    order.shipping_last_name,
    order.patient_name,
    order.patient_full_name,
  ].some((value) => containsAnyMarker(value, textMarkers));
  if (customerText) return true;

  const email = normalizedText(order.shipping_email);
  return Boolean(
    email &&
      (email.includes("+test") ||
        email.startsWith("test@") ||
        email.includes("@example.") ||
        email.endsWith(".test")),
  );
}

function hasCustomerBlockedStripeStatus(order: OperationalQueueOrder): boolean {
  const stripeStatus = normalizedText(order.stripe_payment_intent_status);
  return CUSTOMER_BLOCKED_STRIPE_STATUSES.has(stripeStatus);
}

function isPaidOrAuthorized(status: PaymentLifecycleStatus): boolean {
  return status === "authorized" || status === "captured";
}

function isCustomerPaymentBlocked(
  order: OperationalQueueOrder,
  paymentStatus: PaymentLifecycleStatus,
): boolean {
  if (hasCustomerBlockedStripeStatus(order)) return true;
  if (!order.payment_intent_id && paymentStatus !== "captured") return true;

  return (
    paymentStatus === "draft" ||
    paymentStatus === "failed" ||
    paymentStatus === "cancelled"
  );
}

function classify(
  bucket: OperationalQueueBucket,
  operatorActionable: boolean,
  reasons: string[],
  order: OperationalQueueOrder,
): OperationalQueueClassification {
  const payment = getPaymentState(order);
  const nextAction = getNextAction(order);

  return {
    bucket,
    operatorActionable,
    reasons,
    nextActionLabel: nextAction.label,
    paymentStatus: payment.status,
  };
}

export function classifyOperationalQueue(
  order: OperationalQueueOrder,
  options: OperationalQueueOptions = {},
): OperationalQueueClassification {
  const now = options.now ?? new Date();
  const recentShippedDays =
    options.recentShippedDays ?? DEFAULT_RECENT_SHIPPED_DAYS;
  const payment = getPaymentState(order);
  const verification = getVerificationState(order);
  const rxSource = getRxSourceState(order);
  const nextAction = getNextAction(order);
  const fulfillment = normalizedFulfillmentStatus(order);

  if (order.archived || order.archived_at) {
    return classify("history_archive", false, ["archived"], order);
  }

  if (isExplicitDraftOrTest(order)) {
    return classify("draft_or_test", false, ["test/internal"], order);
  }

  if (hasEmailDeliveryAttention(order)) {
    return classify(
      "action_required",
      true,
      ["customer email undeliverable"],
      order,
    );
  }

  if (
    fulfillment === "completed" ||
    fulfillment === "cancelled" ||
    payment.status === "refunded"
  ) {
    return classify("history_archive", false, ["terminal"], order);
  }

  if (
    fulfillment === "shipped" &&
    !isWithinDays(order, recentShippedDays, now)
  ) {
    return classify("history_archive", false, ["stale shipped"], order);
  }

  if (
    isCustomerPaymentBlocked(order, payment.status) ||
    CUSTOMER_BLOCKED_NEXT_ACTION_LABELS.has(nextAction.label)
  ) {
    return classify("customer_blocked", false, ["customer/payment"], order);
  }

  if (!isPaidOrAuthorized(payment.status)) {
    return classify("customer_blocked", false, ["unpaid"], order);
  }

  if (fulfillment === "hold") {
    return classify("action_required", true, ["hold"], order);
  }

  if (verification.blocked) {
    return classify("action_required", true, ["verification blocked"], order);
  }

  if (order.rx_status === "ocr_failed" || verification.requiresReview) {
    return classify("action_required", true, ["review prescription"], order);
  }

  if (!rxSource.hasRxEvidence || order.rx_status === "expired") {
    return classify("verification_pending", false, ["customer rx"], order);
  }

  if (!verification.complete) {
    if (nextAction.label === "Verify prescription") {
      return classify("action_required", true, ["verify prescription"], order);
    }

    return classify("verification_pending", false, ["verification pending"], order);
  }

  return classify(
    "active_fulfillment",
    NORMAL_FULFILLMENT_ACTIONS.has(nextAction.label),
    ["fulfillment"],
    order,
  );
}

export function isMerchantQueueBucket(bucket: OperationalQueueBucket): boolean {
  return bucket === "active_fulfillment" || bucket === "action_required";
}
