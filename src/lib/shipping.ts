import { getSkuBoxDurationMonths } from "./pricing/skuDefaults";
import {
  resolveShipping,
  type ShippingResolution,
} from "./shipping/resolveShipping";

export type {
  ResolveShippingInput,
  ShippingResolution,
  ShippingTier,
} from "./shipping/resolveShipping";
export { resolveShipping } from "./shipping/resolveShipping";

export type ShippingOrderInput = {
  manufacturer?: string | null;
  sku?: string | null;
  total_box_count?: number | null;
  box_count?: number | null;
  left_box_count?: number | null;
  right_box_count?: number | null;
};

export function deriveTotalBoxes(order: ShippingOrderInput): number {
  return (
    order.total_box_count ??
    order.box_count ??
    (order.left_box_count ?? 0) + (order.right_box_count ?? 0)
  );
}

export function deriveMonthsPerBox(sku?: string | null): number {
  if (!sku) return 0;

  try {
    return getSkuBoxDurationMonths(sku);
  } catch {
    return 0;
  }
}

export function deriveTotalMonths({
  sku,
  totalBoxes,
  left_box_count,
  right_box_count,
}: {
  sku?: string | null;
  totalBoxes: number;
  left_box_count?: number | null;
  right_box_count?: number | null;
}): number {
  const monthsPerBox = deriveMonthsPerBox(sku);
  if (!monthsPerBox) return 0;

  const sideCounts = [left_box_count, right_box_count].filter(
    (count): count is number => typeof count === "number" && count > 0,
  );

  if (sideCounts.length > 0) {
    return Math.min(...sideCounts.map((count) => count * monthsPerBox));
  }

  return totalBoxes ? totalBoxes * monthsPerBox : 0;
}

export function resolveOrderShipping(
  order: ShippingOrderInput,
): ShippingResolution {
  const totalBoxes = deriveTotalBoxes(order);
  const totalMonths = deriveTotalMonths({
    sku: order.sku,
    totalBoxes,
    left_box_count: order.left_box_count,
    right_box_count: order.right_box_count,
  });

  return resolveShipping({
    manufacturer: order.manufacturer,
    totalMonths,
    itemCount: totalBoxes,
    hasMixedSkus: false,
  });
}
