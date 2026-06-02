type CaptureAmountOrder = {
  id?: string | null;
  total_amount_cents?: number | null;
  capture_amount_cents?: number | null;
};

function orderLabel(order: CaptureAmountOrder): string {
  return order.id ? `Order ${order.id}` : "Order";
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value > 0;
}

export function getCaptureAmountCents(order: CaptureAmountOrder): number {
  const authorizedAmount = order.total_amount_cents;

  if (!isPositiveInteger(authorizedAmount)) {
    throw new Error(`${orderLabel(order)} is missing a valid authorized amount.`);
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
