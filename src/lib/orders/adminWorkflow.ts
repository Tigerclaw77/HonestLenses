import {
  getPaymentState,
  getVerificationState,
  type Order,
} from "./getNextAction";

export const ADMIN_FULFILLMENT_STATUSES = [
  "review",
  "ordered",
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
  "ordered",
];

const PAYMENT_CAPTURE_EXPECTED_STATUSES = new Set<AdminFulfillmentStatus>([
  "ordered",
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

  if (order.status === "cancelled") return "cancelled";
  return "review";
}

/**
 * Fulfillment states that expect captured payment have two hard gates: a real
 * captured payment and, for uploaded prescriptions, completed verification.
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
  const hasCapturedPaymentEvidence =
    payment.status === "captured" && Boolean(order.payment_intent_id?.trim());
  const verification = getVerificationState(order);
  const uploadedRxRequiresReview = Boolean(
    order.rx_upload_path && !verification.complete,
  );

  if (
    PAYMENT_CAPTURE_EXPECTED_STATUSES.has(target) &&
    !hasCapturedPaymentEvidence
  ) {
    warnings.push(
      order.payment_intent_id?.trim()
        ? `Payment is ${payment.label.toLowerCase()}, not captured.`
        : "PaymentIntent is missing; payment cannot be established.",
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

  const currentIndex = FULFILLMENT_PROGRESS_FLOW.indexOf(currentStatus);
  const targetIndex = FULFILLMENT_PROGRESS_FLOW.indexOf(target);

  if (
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

  if (currentStatus === "cancelled" && target !== currentStatus) {
    warnings.push(`This reopens a ${currentStatus} order.`);
  }

  return {
    valid: true,
    allowed:
      !PAYMENT_CAPTURE_EXPECTED_STATUSES.has(target) ||
      (hasCapturedPaymentEvidence && !uploadedRxRequiresReview),
    currentStatus,
    targetStatus: target,
    warnings: [...new Set(warnings)],
  };
}
