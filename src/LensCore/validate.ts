import type { LensCore, RxPayload } from "./types";
import { isValidSphere } from "./utils";

export type ValidationResult = {
  valid: boolean;
  errors: string[];
};

export function validateLensParams(
  lens: LensCore,
  rx: RxPayload,
): ValidationResult {
  const errors: string[] = [];

  if (!lens.parameters?.sphere) {
    return {
      valid: false,
      errors: ["Lens configuration incomplete."],
    };
  }

  // Sphere
  if (rx.sphere == null || Number.isNaN(rx.sphere)) {
    errors.push("Sphere power is required.");
  } else {
    const value = Number(Number(rx.sphere).toFixed(2));

    if (!isValidSphere(value, lens.parameters.sphere)) {
      errors.push("Selected sphere power not manufactured for this lens.");
    }
  }

  // Structural
  if (!lens.type.toric && rx.cylinder != null) {
    errors.push("Cylinder not supported for this lens.");
  }

  if (!lens.type.multifocal && rx.add != null) {
    errors.push("ADD not supported for this lens.");
  }

  // Base Curve
  if (
    rx.baseCurve != null &&
    lens.parameters.baseCurve &&
    !lens.parameters.baseCurve.includes(rx.baseCurve)
  ) {
    errors.push("Invalid base curve for this lens.");
  }

  // Diameter
  if (
    rx.diameter != null &&
    lens.parameters.diameter &&
    !lens.parameters.diameter.includes(rx.diameter)
  ) {
    errors.push("Invalid diameter for this lens.");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}