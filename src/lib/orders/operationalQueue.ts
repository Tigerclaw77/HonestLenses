import {
  getNextAction,
  getPaymentState,
  getRxSourceState,
  getVerificationState,
  hasEmailDeliveryAttention,
  type Order as NextActionOrder,
  type PaymentLifecycleStatus,
} from "./getNextAction";
import {
  isCustomerBlockedPaymentIntentStatus,
  isPaymentAuthorizedOrCaptured,
} from "./paymentState";

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
  integrityIssues: OperationalQueueIntegrityIssue[];
};

export type OperationalQueueIntegrityIssue = {
  code:
    | "ACTION_REQUIRED_WITHOUT_REASON"
    | "COMPLETED_WITHOUT_VERIFICATION"
    | "FULFILLMENT_WITHOUT_CAPTURE"
    | "PAYMENT_STATE_DRIFT"
    | "STRIPE_STATUS_UNAVAILABLE"
    | "UNKNOWN_FULFILLMENT_STATE"
    | "UNKNOWN_VERIFICATION_STATE";
  message: string;
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
  payment_status_source?: string | null;
  abandoned_checkout?: { isAbandoned?: boolean | null } | null;
};

export type ClassifiedOperationalOrder<T extends OperationalQueueOrder> = T & {
  operational_queue: OperationalQueueClassification;
};

export type OperationalQueueGroups<T extends OperationalQueueOrder> = Record<
  OperationalQueueBucket,
  ClassifiedOperationalOrder<T>[]
>;

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

const CUSTOMER_BLOCKED_NEXT_ACTION_LABELS = new Set([
  "Await checkout",
  "Wait for customer",
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
  return isCustomerBlockedPaymentIntentStatus(
    order.stripe_payment_intent_status,
  );
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
  const verification = getVerificationState(order);
  const nextAction = getNextAction(order);
  const fulfillment = normalizedFulfillmentStatus(order);
  const integrityIssues: OperationalQueueIntegrityIssue[] = [];
  const explicitReasons = reasons
    .map((reason) => reason.trim())
    .filter(Boolean);

  if (bucket === "action_required" && explicitReasons.length === 0) {
    integrityIssues.push({
      code: "ACTION_REQUIRED_WITHOUT_REASON",
      message: "Action Required has no operator-facing reason.",
    });
    explicitReasons.push("workflow integrity issue: reason missing");
  }

  if (
    order.fulfillment_status &&
    ![
      "review",
      "ready_to_order",
      "ordered",
      "shipped",
      "completed",
      "hold",
      "cancelled",
    ].includes(order.fulfillment_status)
  ) {
    integrityIssues.push({
      code: "UNKNOWN_FULFILLMENT_STATE",
      message: `Unknown fulfillment state: ${order.fulfillment_status}.`,
    });
  }

  if (verification.status === "unknown") {
    integrityIssues.push({
      code: "UNKNOWN_VERIFICATION_STATE",
      message: `Unknown verification state: ${verification.rawStatus ?? "empty"}.`,
    });
  }

  if (order.payment_status_source === "stripe_lookup_failed") {
    integrityIssues.push({
      code: "STRIPE_STATUS_UNAVAILABLE",
      message:
        "Stripe payment status could not be refreshed; the stored order state may be stale.",
    });
  }

  const localStatus = normalizedText(order.status);
  const stripeStatus = normalizedText(order.stripe_payment_intent_status);
  if (
    (stripeStatus === "succeeded" &&
      localStatus !== "captured" &&
      localStatus !== "completed") ||
    (stripeStatus === "requires_capture" &&
      (localStatus === "captured" || localStatus === "completed"))
  ) {
    integrityIssues.push({
      code: "PAYMENT_STATE_DRIFT",
      message: `Stored order payment state (${localStatus || "empty"}) disagrees with Stripe (${stripeStatus}).`,
    });
  }

  if (
    ["ready_to_order", "ordered", "shipped", "completed"].includes(
      fulfillment,
    ) &&
    payment.status !== "captured"
  ) {
    integrityIssues.push({
      code: "FULFILLMENT_WITHOUT_CAPTURE",
      message: `${fulfillment.replace(/_/g, " ")} fulfillment has a ${payment.label.toLowerCase()} payment.`,
    });
  }

  if (fulfillment === "completed" && !verification.complete) {
    integrityIssues.push({
      code: "COMPLETED_WITHOUT_VERIFICATION",
      message: `Completed order has ${verification.label.toLowerCase()} verification.`,
    });
  }

  return {
    bucket,
    operatorActionable,
    reasons: explicitReasons,
    nextActionLabel: nextAction.label,
    paymentStatus: payment.status,
    integrityIssues,
  };
}

export function classifyOperationalQueue(
  order: OperationalQueueOrder,
  _options: OperationalQueueOptions = {},
): OperationalQueueClassification {
  void _options;
  const payment = getPaymentState(order);
  const verification = getVerificationState(order);
  const rxSource = getRxSourceState(order);
  const nextAction = getNextAction(order);
  const fulfillment = normalizedFulfillmentStatus(order);

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

  if (order.archived || order.archived_at) {
    return classify(
      "action_required",
      true,
      ["archived before completion"],
      order,
    );
  }

  if (order.payment_status_source === "stripe_lookup_failed") {
    return classify(
      "action_required",
      true,
      ["Stripe payment status unavailable"],
      order,
    );
  }

  if (
    order.fulfillment_status &&
    ![
      "review",
      "ready_to_order",
      "ordered",
      "shipped",
      "completed",
      "hold",
      "cancelled",
    ].includes(order.fulfillment_status)
  ) {
    return classify(
      "action_required",
      true,
      [`unknown fulfillment status: ${order.fulfillment_status}`],
      order,
    );
  }

  if (verification.status === "unknown") {
    return classify(
      "action_required",
      true,
      [
        `unknown verification status: ${verification.rawStatus ?? "empty"}`,
      ],
      order,
    );
  }

  if (
    isCustomerPaymentBlocked(order, payment.status) ||
    CUSTOMER_BLOCKED_NEXT_ACTION_LABELS.has(nextAction.label)
  ) {
    return classify("customer_blocked", false, ["customer/payment"], order);
  }

  if (!isPaymentAuthorizedOrCaptured(payment.status)) {
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

  if (verification.status === "information_needed") {
    return classify(
      "verification_pending",
      false,
      ["customer verification information"],
      order,
    );
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

/**
 * Partitions each input row exactly once using the canonical classifier.
 * Consumers should render these assignments directly instead of reclassifying
 * rows independently.
 */
export function groupOperationalQueueOrders<T extends OperationalQueueOrder>(
  orders: T[],
  options: OperationalQueueOptions = {},
): OperationalQueueGroups<T> {
  const groups: OperationalQueueGroups<T> = {
    active_fulfillment: [],
    action_required: [],
    verification_pending: [],
    customer_blocked: [],
    draft_or_test: [],
    history_archive: [],
  };

  for (const order of orders) {
    const operationalQueue = classifyOperationalQueue(order, options);
    groups[operationalQueue.bucket].push({
      ...order,
      operational_queue: operationalQueue,
    });
  }

  return groups;
}
