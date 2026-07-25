export type OrderQuantityFields = {
  right_box_count?: number | null;
  left_box_count?: number | null;
  total_box_count?: number | null;
  box_count?: number | null;
  adjusted_right_box_count?: number | null;
  adjusted_left_box_count?: number | null;
  adjusted_total_box_count?: number | null;
};

export type AuthoritativeOrderQuantity = {
  right: number;
  left: number;
  total: number;
  adjusted: boolean;
};

function count(value: number | null | undefined): number | null {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0
    ? value
    : null;
}

export function getAuthoritativeOrderQuantity(
  order: OrderQuantityFields,
): AuthoritativeOrderQuantity {
  const adjustedRight = count(order.adjusted_right_box_count);
  const adjustedLeft = count(order.adjusted_left_box_count);
  const adjustedTotal = count(order.adjusted_total_box_count);

  if (
    adjustedRight !== null &&
    adjustedLeft !== null &&
    adjustedTotal !== null &&
    adjustedRight + adjustedLeft === adjustedTotal &&
    adjustedTotal > 0
  ) {
    return {
      right: adjustedRight,
      left: adjustedLeft,
      total: adjustedTotal,
      adjusted: true,
    };
  }

  const right = count(order.right_box_count) ?? 0;
  const left = count(order.left_box_count) ?? 0;
  const storedTotal = count(order.total_box_count) ?? count(order.box_count);

  return {
    right,
    left,
    total: storedTotal ?? right + left,
    adjusted: false,
  };
}
