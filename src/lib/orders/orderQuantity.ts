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

function getAdjustedOrderQuantity(
  order: OrderQuantityFields,
): AuthoritativeOrderQuantity | null {
  const right = count(order.adjusted_right_box_count);
  const left = count(order.adjusted_left_box_count);
  const total = count(order.adjusted_total_box_count);

  if (
    right !== null &&
    left !== null &&
    total !== null &&
    right + left === total &&
    total > 0
  ) {
    return { right, left, total, adjusted: true };
  }

  return null;
}

export function getAuthoritativeOrderQuantity(
  order: OrderQuantityFields,
): AuthoritativeOrderQuantity {
  const adjusted = getAdjustedOrderQuantity(order);
  if (adjusted) return adjusted;

  const storedRight = count(order.right_box_count);
  const storedLeft = count(order.left_box_count);
  const right = storedRight ?? 0;
  const left = storedLeft ?? 0;
  const storedTotal = count(order.total_box_count) ?? count(order.box_count);

  return {
    right,
    left,
    total: storedTotal ?? right + left,
    adjusted: false,
  };
}

export function getStoredEyeQuantityPresence(order: OrderQuantityFields): {
  right: boolean;
  left: boolean;
} {
  if (getAdjustedOrderQuantity(order)) {
    return { right: true, left: true };
  }

  return {
    right: count(order.right_box_count) !== null,
    left: count(order.left_box_count) !== null,
  };
}
