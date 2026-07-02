import {
  getPaymentState,
  getRxSourceState,
  getVerificationState,
  type Order as OrderLifecycleInput,
} from "./getNextAction";

export type OperationalQueueOrder = OrderLifecycleInput & {
  shipping_email?: string | null;
  shipping_first_name?: string | null;
  shipping_last_name?: string | null;
  shipping_address1?: string | null;
  shipping_city?: string | null;
  shipping_state?: string | null;
  shipping_zip?: string | null;
};

export type CustomerBlocker =
  | "awaiting_payment"
  | "payment_unrecoverable"
  | "awaiting_rx"
  | "awaiting_shipping"
  | "awaiting_customer_correction";

function hasText(value?: string | null): boolean {
  return Boolean(value?.trim());
}

export function hasFulfillmentShipping(order: OperationalQueueOrder): boolean {
  return Boolean(
    hasText(order.shipping_email) &&
      hasText(order.shipping_first_name) &&
      hasText(order.shipping_last_name) &&
      hasText(order.shipping_address1) &&
      hasText(order.shipping_city) &&
      hasText(order.shipping_state) &&
      hasText(order.shipping_zip),
  );
}

export function getCustomerBlockers(
  order: OperationalQueueOrder,
): CustomerBlocker[] {
  const blockers: CustomerBlocker[] = [];
  const payment = getPaymentState(order);
  const rxSource = getRxSourceState(order);
  const verification = getVerificationState(order);

  if (payment.status === "draft" || !order.payment_intent_id) {
    blockers.push("awaiting_payment");
  }

  if (
    payment.status === "failed" ||
    payment.status === "refunded" ||
    payment.status === "cancelled"
  ) {
    blockers.push("payment_unrecoverable");
  }

  if (!hasFulfillmentShipping(order)) {
    blockers.push("awaiting_shipping");
  }

  if (!rxSource.hasRxEvidence) {
    blockers.push("awaiting_rx");
  }

  if (verification.blocked || order.rx_status === "expired") {
    blockers.push("awaiting_customer_correction");
  }

  return blockers;
}

export function isWaitingOnCustomer(order: OperationalQueueOrder): boolean {
  return getCustomerBlockers(order).length > 0;
}
