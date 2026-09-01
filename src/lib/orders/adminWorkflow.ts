import {
  getPaymentState,
  getRxSourceState,
  getVerificationState,
  type Order,
} from "./getNextAction";

export const ADMIN_FULFILLMENT_STATUSES = [
  "review",
  "ready_to_order",
  "ordered",
  "shipped",
  "completed",
  "hold",
  "cancelled",
] as const;

export type AdminFulfillmentStatus =
  (typeof ADMIN_FULFILLMENT_STATUSES)[number];

export type AdminFulfillmentTransition = {
  valid: boolean;
  allowed: boolean;
  currentStatus: AdminFulfillmentStatus;
  targetStatus: AdminFulfillmentStatus | null;
  warnings: string[];
};

const FULFILLMENT_PROGRESS_FLOW: AdminFulfillmentStatus[] = [
  "review",
  "ready_to_order",
  "ordered",
  "shipped",
  "completed",
];

const PAYMENT_CAPTURE_EXPECTED_STATUSES = new Set<AdminFulfillmentStatus>([
  "ready_to_order",
  "ordered",
  "shipped",
  "completed",
]);

export function isAdminFulfillmentStatus(
  value: unknown,
): value is AdminFulfillmentStatus {
  return ADMIN_FULFILLMENT_STATUSES.includes(
    value as AdminFulfillmentStatus,
  );
}

export function getAdminFulfillmentStatus(
  order: Order,
): AdminFulfillmentStatus {
  if (isAdminFulfillmentStatus(order.fulfillment_status)) {
    return order.fulfillment_status;
  }

  if (order.status === "completed") return "completed";
  if (order.status === "shipped") return "shipped";
  if (order.status === "cancelled") return "cancelled";
  return "review";
}

/** Founder override resolves Rx review exceptions, never payment or holds. */
export function isFounderOverrideEligible(order: Order): boolean {
  const fulfillment = getAdminFulfillmentStatus(order);
  const payment = getPaymentState(order);
  const verification = getVerificationState(order);
  const rxSource = getRxSourceState(order);

  if (fulfillment !== "review" || verification.complete) return false;
  if (payment.status !== "authorized" && payment.status !== "captured") {
    return false;
  }

  return Boolean(
    rxSource.hasRxEvidence ||
      verification.requiresReview ||
      verification.blocked ||
      order.rx_status === "ocr_failed",
  );
}

/**
 * Admin fulfillment changes are overrides. Uploaded prescriptions are the one
 * hard gate: they cannot enter a fulfillment state that expects captured
 * payment until prescription verification is complete.
 */
export function assessAdminFulfillmentTransition(
  order: Order,
  target: unknown,
): AdminFulfillmentTransition {
  const currentStatus = getAdminFulfillmentStatus(order);

  if (!isAdminFulfillmentStatus(target)) {
    return {
      valid: false,
      allowed: false,
      currentStatus,
      targetStatus: null,
      warnings: ["Unknown fulfillment status."],
    };
  }

  const warnings: string[] = [];
  const payment = getPaymentState(order);
  const verification = getVerificationState(order);
  const uploadedRxRequiresReview = Boolean(
    order.rx_upload_path && !verification.complete,
  );

  if (
    PAYMENT_CAPTURE_EXPECTED_STATUSES.has(target) &&
    payment.status !== "captured"
  ) {
    warnings.push(
      `Payment is ${payment.label.toLowerCase()}, not captured.`,
    );
  }

  if (
    PAYMENT_CAPTURE_EXPECTED_STATUSES.has(target) &&
    uploadedRxRequiresReview
  ) {
    warnings.push(
      "Review the uploaded prescription and use Verify prescription before advancing fulfillment.",
    );
  }

  if (target === "completed" && !verification.complete) {
    warnings.push(
      `Prescription verification is ${verification.label.toLowerCase()}.`,
    );
  }

  const currentIndex = FULFILLMENT_PROGRESS_FLOW.indexOf(currentStatus);
  const targetIndex = FULFILLMENT_PROGRESS_FLOW.indexOf(target);

  if (
    target === "completed" &&
    currentStatus !== "shipped" &&
    currentStatus !== "completed"
  ) {
    warnings.push(
      `This skips fulfillment steps from ${currentStatus.replace(/_/g, " ")} to completed.`,
    );
  } else if (
    currentIndex >= 0 &&
    targetIndex >= 0 &&
    targetIndex > currentIndex + 1
  ) {
    warnings.push("This skips one or more fulfillment steps.");
  }

  if (
    currentIndex >= 0 &&
    targetIndex >= 0 &&
    targetIndex < currentIndex
  ) {
    warnings.push("This moves the fulfillment workflow backward.");
  }

  if (
    (currentStatus === "completed" || currentStatus === "cancelled") &&
    target !== currentStatus
  ) {
    warnings.push(`This reopens a ${currentStatus} order.`);
  }

  return {
    valid: true,
    allowed: !(
      PAYMENT_CAPTURE_EXPECTED_STATUSES.has(target) &&
      uploadedRxRequiresReview
    ),
    currentStatus,
    targetStatus: target,
    warnings: [...new Set(warnings)],
  };
}
