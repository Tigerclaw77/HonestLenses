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
  | "awaiting_verification"
  | "ready_to_order"
  | "resolve_exception"
  | "supplier_managed"
  | "customer_blocked"
  | "draft_or_test"
  | "history_archive";

export type AdminWorkQueueBucket =
  | "awaiting_verification"
  | "ready_to_order"
  | "resolve_exception";

export const ADMIN_WORK_QUEUE_SECTIONS: ReadonlyArray<{
  key: AdminWorkQueueBucket;
  title: string;
  description: string;
}> = [
  {
    key: "awaiting_verification",
    title: "Awaiting Verification",
    description:
      "Authorized or paid orders still moving through prescription verification.",
  },
  {
    key: "ready_to_order",
    title: "Ready to Order",
    description:
      "Verification is complete. Capture payment if needed, then place the supplier order.",
  },
  {
    key: "resolve_exception",
    title: "Resolve Exception",
    description:
      "A specific payment, verification, supplier, or data issue needs founder action.",
  },
];

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
  | "backordered"
  | "shipped"
  | "delivered"
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

const SUPPLIER_MANAGED_FULFILLMENT_STATUSES = new Set<FulfillmentStatus>([
  "ordered",
  "backordered",
  "shipped",
  "delivered",
]);

const KNOWN_FULFILLMENT_STATUSES = new Set<FulfillmentStatus>([
  "review",
  "ready_to_order",
  "ordered",
  "backordered",
  "shipped",
  "delivered",
  "completed",
  "hold",
  "cancelled",
]);

function normalizedFulfillmentStatus(
  order: OperationalQueueOrder,
): FulfillmentStatus {
  if (
    order.fulfillment_status === "review" ||
    order.fulfillment_status === "ready_to_order" ||
    order.fulfillment_status === "ordered" ||
    order.fulfillment_status === "backordered" ||
    order.fulfillment_status === "shipped" ||
    order.fulfillment_status === "delivered" ||
    order.fulfillment_status === "completed" ||
    order.fulfillment_status === "hold" ||
    order.fulfillment_status === "cancelled"
  ) {
    return order.fulfillment_status;
  }

  if (order.status === "completed") return "completed";
  if (order.status === "delivered") return "delivered";
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

function uniqueReasons(reasons: string[]): string[] {
  return [...new Set(reasons.map((reason) => reason.trim()).filter(Boolean))];
}

function explicitFounderActionReasons(
  order: OperationalQueueOrder,
): string[] {
  const notes = order.admin_notes?.trim() ?? "";
  if (!notes) return [];

  const reasons: string[] = [];
  const markedReason = notes.match(
    /(?:founder action required|resolve exception|armory exception)\s*:\s*([^\r\n]+)/i,
  )?.[1];
  if (markedReason) reasons.push(markedReason);

  if (/\b(dispute|chargeback)\b/i.test(notes)) {
    reasons.push("Payment dispute or chargeback requires founder review.");
  }
  if (/\b(address mismatch|wrong address)\b/i.test(notes)) {
    reasons.push("Shipping address mismatch requires founder correction.");
  }
  if (/\b(rx|prescription) mismatch\b|\bwrong rx\b/i.test(notes)) {
    reasons.push("Prescription mismatch requires founder review.");
  }
  if (/\bcomplaint\b|\bcustomer question\b|\border question\b/i.test(notes)) {
    reasons.push("A customer complaint or order question requires founder response.");
  }

  return uniqueReasons(reasons);
}

function stateExceptionReasons(
  order: OperationalQueueOrder,
  fulfillment: FulfillmentStatus,
  paymentStatus: PaymentLifecycleStatus,
): string[] {
  const reasons = explicitFounderActionReasons(order);
  const rawFulfillment = normalizedText(order.fulfillment_status);
  const localStatus = normalizedText(order.status);
  const stripeStatus = normalizedText(order.stripe_payment_intent_status);

  if (order.payment_status_source === "stripe_lookup_failed") {
    reasons.push(
      "Stripe payment status could not be refreshed; confirm payment before continuing.",
    );
  }

  if (
    rawFulfillment &&
    !KNOWN_FULFILLMENT_STATUSES.has(rawFulfillment as FulfillmentStatus)
  ) {
    reasons.push(
      `Unknown fulfillment status "${order.fulfillment_status}" requires correction.`,
    );
  }

  if (
    (stripeStatus === "succeeded" &&
      localStatus !== "captured" &&
      localStatus !== "completed") ||
    (stripeStatus === "requires_capture" &&
      (localStatus === "captured" || localStatus === "completed"))
  ) {
    reasons.push(
      `Stored payment state "${localStatus || "empty"}" disagrees with Stripe "${stripeStatus}"; reconcile the order before continuing.`,
    );
  }

  if (
    ["ready_to_order", "ordered", "backordered", "shipped", "delivered", "completed"].includes(
      fulfillment,
    ) &&
    paymentStatus !== "captured"
  ) {
    reasons.push(
      `${fulfillment.replace(/_/g, " ")} fulfillment requires captured payment, but payment is ${paymentStatus}.`,
    );
  }

  return uniqueReasons(reasons);
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

  if (bucket === "resolve_exception" && explicitReasons.length === 0) {
    integrityIssues.push({
      code: "ACTION_REQUIRED_WITHOUT_REASON",
      message: "Resolve Exception has no operator-facing reason.",
    });
    explicitReasons.push(
      "Workflow integrity failed to provide an exception reason; inspect the order state before continuing.",
    );
  }

  if (
    order.fulfillment_status &&
    !KNOWN_FULFILLMENT_STATUSES.has(
      order.fulfillment_status as FulfillmentStatus,
    )
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
    ["ready_to_order", "ordered", "backordered", "shipped", "delivered", "completed"].includes(
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
    return classify(
      "draft_or_test",
      false,
      ["Internal, test, or experiment order."],
      order,
    );
  }

  if (hasEmailDeliveryAttention(order)) {
    return classify(
      "resolve_exception",
      true,
      [
        "Customer email could not be delivered; confirm or correct the email address.",
      ],
      order,
    );
  }

  const exceptionReasons = stateExceptionReasons(
    order,
    fulfillment,
    payment.status,
  );
  if (verification.status === "unknown") {
    exceptionReasons.push(
      `Unknown verification status "${verification.rawStatus ?? "empty"}" requires correction.`,
    );
  }

  if (exceptionReasons.length > 0) {
    return classify(
      "resolve_exception",
      true,
      uniqueReasons(exceptionReasons),
      order,
    );
  }

  if (order.archived || order.archived_at) {
    return classify(
      "resolve_exception",
      true,
      [
        "This order was archived before fulfillment completed; restore or resolve it.",
      ],
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

  if (fulfillment === "hold") {
    return classify(
      "resolve_exception",
      true,
      [
        "Supplier workflow placed this order on hold; review the supplier issue in Armory and decide how to proceed.",
      ],
      order,
    );
  }

  if (verification.blocked) {
    return classify(
      "resolve_exception",
      true,
      [
        `Prescription verification is ${verification.label.toLowerCase()}; resolve the verification issue before fulfillment.`,
      ],
      order,
    );
  }

  if (SUPPLIER_MANAGED_FULFILLMENT_STATUSES.has(fulfillment)) {
    return classify(
      "supplier_managed",
      false,
      ["Supplier order placed; Armory owns lifecycle tracking."],
      order,
    );
  }

  if (
    isCustomerPaymentBlocked(order, payment.status) ||
    CUSTOMER_BLOCKED_NEXT_ACTION_LABELS.has(nextAction.label)
  ) {
    return classify(
      "customer_blocked",
      false,
      ["Customer checkout or payment is incomplete."],
      order,
    );
  }

  if (!isPaymentAuthorizedOrCaptured(payment.status)) {
    return classify(
      "customer_blocked",
      false,
      ["Payment is not authorized or captured."],
      order,
    );
  }

  if (order.rx_status === "ocr_failed") {
    return classify(
      "awaiting_verification",
      true,
      ["Prescription image could not be read; review it manually."],
      order,
    );
  }

  if (verification.requiresReview) {
    return classify(
      "awaiting_verification",
      true,
      [
        `Prescription verification requires review (${verification.label.toLowerCase()}).`,
      ],
      order,
    );
  }

  if (verification.status === "information_needed") {
    return classify(
      "awaiting_verification",
      false,
      ["Prescription verification is waiting for customer information."],
      order,
    );
  }

  if (!rxSource.hasRxEvidence || order.rx_status === "expired") {
    return classify(
      "awaiting_verification",
      false,
      [
        "Valid prescription evidence is missing or expired; obtain updated prescription information.",
      ],
      order,
    );
  }

  if (!verification.complete) {
    const doctorVerification =
      nextAction.label === "Await doctor verification";
    return classify(
      "awaiting_verification",
      !doctorVerification,
      [
        doctorVerification
          ? "Waiting for prescriber verification."
          : "Prescription verification has not been completed.",
      ],
      order,
    );
  }

  return classify(
    "ready_to_order",
    true,
    [
      payment.status === "authorized"
        ? "Prescription verification is complete; capture payment before placing the supplier order."
        : "Payment is captured and prescription verification is complete; place the supplier order.",
    ],
    order,
  );
}

export function isMerchantQueueBucket(bucket: OperationalQueueBucket): boolean {
  return ADMIN_WORK_QUEUE_SECTIONS.some((section) => section.key === bucket);
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
    awaiting_verification: [],
    ready_to_order: [],
    resolve_exception: [],
    supplier_managed: [],
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
