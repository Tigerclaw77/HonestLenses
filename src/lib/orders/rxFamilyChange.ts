type Eye = "right" | "left";

function coreIdForEye(rx: unknown, eye: Eye): string | null {
  if (!rx || typeof rx !== "object") return null;

  const eyeRx = (rx as Record<Eye, unknown>)[eye];
  if (!eyeRx || typeof eyeRx !== "object") return null;

  const coreId = (eyeRx as { coreId?: unknown }).coreId;
  return typeof coreId === "string" && coreId.trim() ? coreId.trim() : null;
}

/**
 * An order has one purchasable SKU, but its Rx records the requested family for
 * each eye. Any change to that selection invalidates saved cart quantities and
 * quantity adjustments from the previous family before the SKU is replaced.
 */
export function hasLensFamilySelectionChanged(
  persistedRx: unknown,
  nextRx: unknown,
): boolean {
  return (
    coreIdForEye(persistedRx, "right") !== coreIdForEye(nextRx, "right") ||
    coreIdForEye(persistedRx, "left") !== coreIdForEye(nextRx, "left")
  );
}

/** Fields cleared when an Rx switches lens family; cart resolution repopulates defaults. */
export function getLensFamilyQuantityReset(
  persistedRx: unknown,
  nextRx: unknown,
) {
  if (!hasLensFamilySelectionChanged(persistedRx, nextRx)) return {};

  return {
    right_box_count: null,
    left_box_count: null,
    total_box_count: null,
    box_count: 0,
    adjusted_right_box_count: null,
    adjusted_left_box_count: null,
    adjusted_total_box_count: null,
    order_quantity_adjustment_reason: null,
    order_quantity_adjusted_by: null,
    order_quantity_adjusted_at: null,
  };
}
