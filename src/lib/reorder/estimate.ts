import { lenses } from "@/LensCore";
import { getPackSizeFromSku } from "@/lib/cart/skuPackSize";
import { getLensSkus } from "@/lib/pricing/getLensSkus";

export type ReplenishmentInput = {
  sku: string | null;
  rightBoxes: number;
  leftBoxes: number;
  orderedAt: string;
  deliveredAt?: string | null;
  wearDaysPerWeek?: number | null;
  previousOrderAt?: string | null;
};

export type ReplenishmentEstimate = {
  reminderAt: string;
  estimatedSupplyDays: number | null;
  basis: "wear_frequency" | "purchase_history" | "neutral_recall";
};

const DAY = 86_400_000;

/** Estimates are for scheduling neutral outreach, never a claim of imminent depletion. */
export function estimateReplenishment(input: ReplenishmentInput): ReplenishmentEstimate | null {
  const orderTime = Date.parse(input.orderedAt);
  if (!Number.isFinite(orderTime)) return null;
  const deliveryTime = input.deliveredAt ? Date.parse(input.deliveredAt) : NaN;
  const start = Number.isFinite(deliveryTime) && deliveryTime >= orderTime
    ? deliveryTime : orderTime + 7 * DAY;
  const counts = [input.rightBoxes, input.leftBoxes].filter(value => Number.isInteger(value) && value > 0);
  const packSize = input.sku ? getPackSizeFromSku(input.sku) : null;
  const lens = lenses.find(candidate => input.sku && getLensSkus(candidate).includes(input.sku));
  const frequency = input.wearDaysPerWeek;
  if (counts.length && packSize && lens && frequency != null &&
      Number.isInteger(frequency) && frequency >= 1 && frequency <= 7) {
    const minBoxes = Math.min(...counts);
    const schedule = lens.replacement;
    const supplyDays = schedule === "DD"
      ? Math.ceil((minBoxes * packSize / frequency) * 7)
      : schedule === "1W" ? minBoxes * packSize * 7
      : schedule === "2W" ? minBoxes * packSize * 14
      : schedule === "1M" ? minBoxes * packSize * 30
      : null;
    if (supplyDays && supplyDays >= 35) return {
      reminderAt: new Date(start + Math.max(21, supplyDays - 21) * DAY).toISOString(),
      estimatedSupplyDays: supplyDays,
      basis: "wear_frequency",
    };
  }
  const previous = input.previousOrderAt ? Date.parse(input.previousOrderAt) : NaN;
  const intervalDays = Number.isFinite(previous) ? Math.round((orderTime - previous) / DAY) : 0;
  if (intervalDays >= 45 && intervalDays <= 540) return {
    reminderAt: new Date(start + Math.max(30, intervalDays - 21) * DAY).toISOString(),
    estimatedSupplyDays: null,
    basis: "purchase_history",
  };
  return {
    reminderAt: new Date(start + 90 * DAY).toISOString(),
    estimatedSupplyDays: null,
    basis: "neutral_recall",
  };
}
