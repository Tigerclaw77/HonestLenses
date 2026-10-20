import { lenses } from "@/LensCore";
import { getPackSizeFromSku } from "@/lib/cart/skuPackSize";
import { getLensSkus } from "@/lib/pricing/getLensSkus";

export type ReplenishmentInput = {
  sku: string | null;
  rightBoxes: number;
  leftBoxes: number;
  rx?: unknown;
  orderedAt: string;
  deliveredAt?: string | null;
  estimatedDeliveredAt?: string | null;
  wearDaysPerWeek?: number | null;
};

export type ReplenishmentEstimate = {
  reminderAt: string;
  depletionAt: string;
  estimatedSupplyDays: number;
  confidence: "high" | "medium" | "low";
  deliveryBasis: "confirmed" | "estimated" | "purchase_plus_seven_days";
  eyeBasis: "separate_eyes" | "shared_identical_ou" | "unilateral" |
    "single_eye_allocation" | "assumed_bilateral";
  wearBasis: "known_frequency" | "assumed_daily" | "calendar_replacement";
};

const DAY = 86_400_000;
const NORMAL_FULFILLMENT_DAYS = 7;

function validBoxes(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function eyePrescription(rx: unknown): { right: unknown; left: unknown } {
  const record = rx && typeof rx === "object" && !Array.isArray(rx)
    ? rx as Record<string, unknown> : {};
  return { right: record.right, left: record.left };
}

function sameEyePrescription(a: unknown, b: unknown): boolean {
  if (!a || !b || typeof a !== "object" || typeof b !== "object" ||
      Array.isArray(a) || Array.isArray(b)) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left).sort();
  return keys.length === Object.keys(right).length &&
    keys.every(key => key in right && JSON.stringify(left[key]) === JSON.stringify(right[key]));
}

/** Schedule neutral outreach from physical supply; unknown products or quantities have no invented date. */
export function estimateReplenishment(input: ReplenishmentInput): ReplenishmentEstimate | null {
  const orderTime = Date.parse(input.orderedAt);
  if (!Number.isFinite(orderTime) || !validBoxes(input.rightBoxes) ||
      !validBoxes(input.leftBoxes) || input.rightBoxes + input.leftBoxes === 0 ||
      !input.sku) return null;
  const packSize = getPackSizeFromSku(input.sku);
  const lens = lenses.find(candidate => getLensSkus(candidate).includes(input.sku!));
  if (!packSize || !Number.isSafeInteger(packSize) || !lens) return null;
  const interval = { DD: 1, "1W": 7, "2W": 14, "1M": 30 }[lens.replacement];
  if (!interval) return null;

  const { right, left } = eyePrescription(input.rx);
  const hasRight = right != null && typeof right === "object";
  const hasLeft = left != null && typeof left === "object";
  let lensesPerEye: number;
  let eyeBasis: ReplenishmentEstimate["eyeBasis"];
  let confidence: ReplenishmentEstimate["confidence"] = "high";
  if (input.rightBoxes > 0 && input.leftBoxes > 0) {
    if (hasRight !== hasLeft) return null; // Purchase and explicit unilateral Rx conflict.
    lensesPerEye = Math.min(input.rightBoxes, input.leftBoxes) * packSize;
    eyeBasis = "separate_eyes";
    if (!hasRight) confidence = "medium";
  } else if (hasRight && hasLeft && sameEyePrescription(right, left)) {
    // A single pooled box for identical OU powers supplies two eyes.
    lensesPerEye = Math.floor((input.rightBoxes + input.leftBoxes) * packSize / 2);
    eyeBasis = "shared_identical_ou";
  } else if ((hasRight && !hasLeft && input.rightBoxes > 0) ||
             (hasLeft && !hasRight && input.leftBoxes > 0)) {
    lensesPerEye = (input.rightBoxes + input.leftBoxes) * packSize;
    eyeBasis = "unilateral";
  } else if (hasRight && hasLeft) {
    // Different OU powers with boxes for just one eye imply a partial purchase.
    lensesPerEye = (input.rightBoxes + input.leftBoxes) * packSize;
    eyeBasis = "single_eye_allocation";
    confidence = "low";
  } else if (!hasRight && !hasLeft) {
    lensesPerEye = Math.floor((input.rightBoxes + input.leftBoxes) * packSize / 2);
    eyeBasis = "assumed_bilateral";
    confidence = "low";
  } else {
    return null; // The purchased eye contradicts the documented unilateral Rx.
  }
  if (lensesPerEye < 1) return null;

  const frequency = input.wearDaysPerWeek;
  if (frequency != null && (!Number.isInteger(frequency) || frequency < 1 || frequency > 7)) return null;
  const wearBasis: ReplenishmentEstimate["wearBasis"] = lens.replacement !== "DD"
    ? "calendar_replacement" : frequency == null ? "assumed_daily" : "known_frequency";
  if (wearBasis === "assumed_daily") confidence = "low";
  const supplyDays = lens.replacement === "DD"
    ? Math.ceil(lensesPerEye * 7 / (frequency ?? 7))
    : lensesPerEye * interval;
  if (!Number.isSafeInteger(supplyDays) || supplyDays < 1) return null;

  const confirmed = input.deliveredAt ? Date.parse(input.deliveredAt) : NaN;
  const projected = input.estimatedDeliveredAt ? Date.parse(input.estimatedDeliveredAt) : NaN;
  const hasConfirmed = Number.isFinite(confirmed) && confirmed >= orderTime;
  const hasProjected = Number.isFinite(projected) && projected >= orderTime;
  const start = hasConfirmed ? confirmed : hasProjected ? projected
    : orderTime + NORMAL_FULFILLMENT_DAYS * DAY;
  const deliveryBasis = hasConfirmed ? "confirmed" : hasProjected ? "estimated"
    : "purchase_plus_seven_days";
  if (deliveryBasis === "purchase_plus_seven_days" && confidence === "high") confidence = "medium";
  const depletion = start + supplyDays * DAY;
  return {
    reminderAt: new Date(depletion - 14 * DAY).toISOString(),
    depletionAt: new Date(depletion).toISOString(),
    estimatedSupplyDays: supplyDays,
    confidence, deliveryBasis, eyeBasis, wearBasis,
  };
}
