type CaptureAmountOrder = {
  id?: string | null;
  total_amount_cents?: number | null;
  feedback_credit_cents?: number | null;
  capture_amount_cents?: number | null;
};

function orderLabel(order: CaptureAmountOrder): string {
  return order.id ? `Order ${order.id}` : "Order";
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value > 0;
}

export function getCaptureAmountCents(order: CaptureAmountOrder): number {
  const grossAmount = order.total_amount_cents;

  if (!isPositiveInteger(grossAmount)) {
    throw new Error(`${orderLabel(order)} is missing a valid authorized amount.`);
  }

  const creditAmount =
    typeof order.feedback_credit_cents === "number" &&
    Number.isInteger(order.feedback_credit_cents) &&
    order.feedback_credit_cents > 0
      ? Math.min(order.feedback_credit_cents, 1000)
      : 0;

  const authorizedAmount = grossAmount - creditAmount;

  if (!isPositiveInteger(authorizedAmount)) {
    throw new Error(`${orderLabel(order)} has an invalid net authorized amount.`);
  }

  const adjustedAmount = order.capture_amount_cents;

  if (adjustedAmount === null || adjustedAmount === undefined) {
    return authorizedAmount;
  }

  if (!isPositiveInteger(adjustedAmount)) {
    throw new Error(`${orderLabel(order)} has an invalid capture amount.`);
  }

  if (adjustedAmount > authorizedAmount) {
    throw new Error(
      `${orderLabel(order)} capture amount exceeds the authorized amount.`,
    );
  }

  return adjustedAmount;
}
