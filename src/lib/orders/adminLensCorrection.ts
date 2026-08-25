import { resolveLensRxState, validateLensParams } from "@/LensCore";
import type { LensCore } from "@/LensCore/types";

export type AdminLensCorrectionEye = {
  sphere: number;
  cylinder?: number | null;
  axis?: number | null;
  add?: string | null;
  base_curve?: number | null;
  diameter?: number | null;
};

export type AdminLensCorrectionInput = {
  expires: string;
  right: AdminLensCorrectionEye;
  left: AdminLensCorrectionEye;
  rightBoxCount: number;
  leftBoxCount: number;
  sharedPackForBothEyes: boolean;
  reason: string;
  customerApprovedSubstitution: boolean;
  paymentAlreadyCaptured: boolean;
  capturedAmountCents: number | null;
  supplierOrderAlreadyPlaced: boolean;
};

export type AdminLensCorrectionQuote = {
  manufacturer: string;
  shippingMethod: "standard" | "express";
  shippingCents: number;
  totalAmountCents: number;
  priceReason: string;
};

type CorrectionOrder = {
  id: string;
  admin_notes?: string | null;
};

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function sameEye(
  left: AdminLensCorrectionEye,
  right: AdminLensCorrectionEye,
): boolean {
  return (
    left.sphere === right.sphere &&
    (left.cylinder ?? null) === (right.cylinder ?? null) &&
    (left.axis ?? null) === (right.axis ?? null) &&
    (left.add ?? null) === (right.add ?? null) &&
    (left.base_curve ?? null) === (right.base_curve ?? null) &&
    (left.diameter ?? null) === (right.diameter ?? null)
  );
}

function normalizeEye(eye: AdminLensCorrectionEye, lens: LensCore) {
  const resolved = resolveLensRxState(lens, {
    sphere: eye.sphere,
    cylinder: eye.cylinder ?? null,
    axis: eye.axis ?? null,
    add: eye.add ?? null,
    baseCurve: eye.base_curve ?? null,
    diameter: eye.diameter ?? null,
  });
  const result = {
    sphere: eye.sphere,
    ...(lens.type.toric && resolved.cylinder.value != null
      ? { cylinder: resolved.cylinder.value }
      : {}),
    ...(lens.type.toric && resolved.axis.value != null
      ? { axis: resolved.axis.value }
      : {}),
    ...(lens.type.multifocal && resolved.add.value != null
      ? { add: resolved.add.value }
      : {}),
    ...(resolved.baseCurve.value != null
      ? { base_curve: resolved.baseCurve.value }
      : {}),
    ...(resolved.diameter.value != null
      ? { diameter: resolved.diameter.value }
      : {}),
  };
  const validation = validateLensParams(lens, {
    sphere: result.sphere,
    cylinder: result.cylinder ?? null,
    axis: result.axis ?? null,
    add: result.add ?? null,
    baseCurve: result.base_curve ?? null,
    diameter: result.diameter ?? null,
  });
  if (!validation.valid) {
    throw new Error(validation.errors.join(" ") || "Invalid prescription parameters.");
  }
  return result;
}

function appendReconciliationNote(
  existingNotes: string | null | undefined,
  note: string,
): string {
  const existing = existingNotes?.trim();
  return existing ? `${existing}\n\n${note}` : note;
}

/**
 * Builds an administrative record-correction patch only. It never derives a
 * Stripe action, changes a historical price, or submits a supplier order.
 */
export function buildAdminLensCorrectionPatch({
  order,
  input,
  lens,
  sku,
  quote,
  actor,
  now,
}: {
  order: CorrectionOrder;
  input: AdminLensCorrectionInput;
  lens: LensCore;
  sku: string;
  quote: AdminLensCorrectionQuote;
  actor: string;
  now: string;
}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.expires)) {
    throw new Error("Prescription expiration date must be an ISO date.");
  }
  if (!input.reason.trim() || input.reason.trim().length > 500) {
    throw new Error("A correction reason of 1 to 500 characters is required.");
  }
  if (
    !isNonNegativeInteger(input.rightBoxCount) ||
    !isNonNegativeInteger(input.leftBoxCount)
  ) {
    throw new Error("Box counts must be non-negative integers.");
  }
  const capturedAmountCents = input.capturedAmountCents;
  if (
    input.paymentAlreadyCaptured &&
    (typeof capturedAmountCents !== "number" ||
      !Number.isInteger(capturedAmountCents) ||
      capturedAmountCents <= 0)
  ) {
    throw new Error("A positive captured amount is required when payment is already captured.");
  }

  const totalBoxCount = input.rightBoxCount + input.leftBoxCount;
  if (totalBoxCount <= 0) throw new Error("Corrected order must contain at least one box.");
  if (input.sharedPackForBothEyes) {
    if (
      totalBoxCount !== 1 ||
      !sameEye(input.right, input.left) ||
      !((input.rightBoxCount === 1 && input.leftBoxCount === 0) ||
        (input.rightBoxCount === 0 && input.leftBoxCount === 1))
    ) {
      throw new Error(
        "A shared pack requires identical OD/OS parameters and exactly one physical box assigned to one eye.",
      );
    }
  }

  const right = normalizeEye(input.right, lens);
  const left = normalizeEye(input.left, lens);
  const rx = {
    expires: input.expires,
    lens_brand: lens.displayName,
    right: { ...right, coreId: lens.coreId, brand: lens.displayName },
    left: { ...left, coreId: lens.coreId, brand: lens.displayName },
  };
  const reconciliationNote = [
    `Admin lens/Rx reconciliation by ${actor} at ${now}.`,
    `Corrected product: ${lens.displayName} (${sku}); ${totalBoxCount} physical box${totalBoxCount === 1 ? "" : "es"}.`,
    `Reason: ${input.reason.trim()}`,
    `Customer approved substitution: ${input.customerApprovedSubstitution ? "yes" : "not recorded"}.`,
    `Supplier order already placed manually: ${input.supplierOrderAlreadyPlaced ? "yes" : "no"}.`,
    `Payment already captured: ${input.paymentAlreadyCaptured ? "yes" : "no"}.`,
  ].join(" ");

  return {
    rx,
    sku,
    manufacturer: quote.manufacturer,
    rx_lens_brand: lens.displayName,
    right_box_count: input.rightBoxCount,
    left_box_count: input.leftBoxCount,
    total_box_count: totalBoxCount,
    box_count: totalBoxCount,
    adjusted_right_box_count: input.rightBoxCount,
    adjusted_left_box_count: input.leftBoxCount,
    adjusted_total_box_count: totalBoxCount,
    order_quantity_adjustment_reason: "Prescription correction",
    order_quantity_adjusted_by: actor,
    order_quantity_adjusted_at: now,
    verification_status: "verified",
    verification_passed: true,
    verification_method: "manual",
    verification_completed_at: now,
    rx_status: "admin_prescription_corrected",
    ...(input.paymentAlreadyCaptured
      ? {
          status: "captured",
          payment_status: "captured",
          capture_amount_cents: capturedAmountCents!,
        }
      : {}),
    ...(input.supplierOrderAlreadyPlaced ? { fulfillment_status: "ordered" } : {}),
    admin_notes: appendReconciliationNote(order.admin_notes, reconciliationNote),
    updated_at: now,
  };
}
