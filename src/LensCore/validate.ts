import type { LensCore, RxPayload } from "./types";
import { isValidSphere } from "./utils";
import { resolveLensRxState } from "./resolveRx";

export type ValidationResult = {
  valid: boolean;
  errors: string[];
};

export function validateLensParams(
  lens: LensCore,
  rx: RxPayload,
): ValidationResult {
  const errors: string[] = [];
  const resolved = resolveLensRxState(lens, rx);

  if (!lens.parameters?.sphere && !lens.parameters?.sphereByBaseCurve) {
    return {
      valid: false,
      errors: ["Lens configuration incomplete."],
    };
  }

  // Sphere
  if (resolved.sphere == null) {
    errors.push("Sphere power is required.");
  } else {
    if (
      resolved.sphereOptions.length > 0
        ? !resolved.sphereOptions.includes(resolved.sphere)
        : lens.parameters.sphere
          ? !isValidSphere(resolved.sphere, lens.parameters.sphere)
          : true
    ) {
      errors.push("Selected sphere power not manufactured for this lens.");
    }
  }

  // Structural
  if (!lens.type.toric && resolved.cylinder.rawValue != null) {
    errors.push("Cylinder not supported for this lens.");
  }

  if (!lens.type.toric && resolved.axis.rawValue != null) {
    errors.push("Axis not supported for this lens.");
  }

  if (!lens.type.multifocal && resolved.add.rawValue != null) {
    errors.push("ADD not supported for this lens.");
  }

  if (lens.type.toric) {
    if (resolved.cylinder.required) {
      errors.push("Cylinder is required for this lens.");
    } else if (resolved.cylinder.invalid) {
      errors.push("Selected cylinder not manufactured for this lens.");
    }

    if (resolved.axis.required) {
      errors.push("Axis is required for this lens.");
    } else if (resolved.axis.invalid) {
      errors.push("Selected axis not manufactured for this lens.");
    }
  }

  if (lens.type.multifocal) {
    if (resolved.add.required) {
      errors.push("ADD is required for this lens.");
    } else if (resolved.add.invalid) {
      errors.push("Selected ADD not manufactured for this lens.");
    }
  }

  // Base Curve
  if (resolved.baseCurve.required) {
    errors.push("Base curve is required for this lens.");
  }

  if (resolved.baseCurve.invalid) {
    errors.push("Invalid base curve for this lens.");
  }

  // Diameter
  if (resolved.diameter.required) {
    errors.push("Diameter is required for this lens.");
  }

  if (resolved.diameter.invalid) {
    errors.push("Invalid diameter for this lens.");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
