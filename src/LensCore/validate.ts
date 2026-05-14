import type { LensCore, RxPayload } from "./types";
import { isValidSphere } from "./utils";
import { resolveAddOptions } from "./helpers/resolveAddOptions";
import { resolveAxisOptions } from "./helpers/resolveAxisOptions";
import { resolveCylinderOptions } from "./helpers/resolveCylinderOptions";
import { resolveSphereOptions } from "./helpers/resolveSphereOptions";

export type ValidationResult = {
  valid: boolean;
  errors: string[];
};

export function validateLensParams(
  lens: LensCore,
  rx: RxPayload,
): ValidationResult {
  const errors: string[] = [];
  const sphere =
    rx.sphere == null || Number.isNaN(rx.sphere)
      ? null
      : Number(Number(rx.sphere).toFixed(2));
  const cylinder =
    rx.cylinder == null || Number.isNaN(rx.cylinder)
      ? null
      : Number(Number(rx.cylinder).toFixed(2));
  const axis =
    rx.axis == null || Number.isNaN(rx.axis) ? null : Number(rx.axis);
  const baseCurve =
    rx.baseCurve == null || Number.isNaN(rx.baseCurve)
      ? null
      : Number(Number(rx.baseCurve).toFixed(1));
  const diameter =
    rx.diameter == null || Number.isNaN(rx.diameter)
      ? null
      : Number(Number(rx.diameter).toFixed(1));
  const add = rx.add ?? null;

  if (!lens.parameters?.sphere) {
    return {
      valid: false,
      errors: ["Lens configuration incomplete."],
    };
  }

  // Sphere
  if (sphere == null) {
    errors.push("Sphere power is required.");
  } else {
    const sphereOptions = resolveSphereOptions(
      lens,
      baseCurve,
      cylinder,
      axis,
      add,
    );

    if (
      sphereOptions.length > 0
        ? !sphereOptions.includes(sphere)
        : !isValidSphere(sphere, lens.parameters.sphere)
    ) {
      errors.push("Selected sphere power not manufactured for this lens.");
    }
  }

  // Structural
  if (!lens.type.toric && cylinder != null) {
    errors.push("Cylinder not supported for this lens.");
  }

  if (!lens.type.toric && axis != null) {
    errors.push("Axis not supported for this lens.");
  }

  if (!lens.type.multifocal && add != null) {
    errors.push("ADD not supported for this lens.");
  }

  if (lens.type.toric) {
    if (cylinder == null) {
      errors.push("Cylinder is required for this lens.");
    } else {
      const cylinderOptions = resolveCylinderOptions(lens, axis, sphere);
      if (
        cylinderOptions.length > 0 &&
        !cylinderOptions.includes(cylinder)
      ) {
        errors.push("Selected cylinder not manufactured for this lens.");
      }
    }

    if (axis == null) {
      errors.push("Axis is required for this lens.");
    } else {
      const axisOptions = resolveAxisOptions(lens, cylinder, sphere);
      if (axisOptions.length > 0 && !axisOptions.includes(axis)) {
        errors.push("Selected axis not manufactured for this lens.");
      }
    }
  }

  if (lens.type.multifocal) {
    const addOptions = resolveAddOptions(lens, baseCurve, sphere);

    if (addOptions.length > 0 && !add) {
      errors.push("ADD is required for this lens.");
    } else if (add && addOptions.length > 0 && !addOptions.includes(add)) {
      errors.push("Selected ADD not manufactured for this lens.");
    }
  }

  // Base Curve
  if (
    lens.parameters.baseCurve &&
    lens.parameters.baseCurve.length > 1 &&
    baseCurve == null
  ) {
    errors.push("Base curve is required for this lens.");
  }

  if (
    baseCurve != null &&
    lens.parameters.baseCurve &&
    !lens.parameters.baseCurve.includes(baseCurve)
  ) {
    errors.push("Invalid base curve for this lens.");
  }

  // Diameter
  if (
    lens.parameters.diameter &&
    lens.parameters.diameter.length > 1 &&
    diameter == null
  ) {
    errors.push("Diameter is required for this lens.");
  }

  if (
    diameter != null &&
    lens.parameters.diameter &&
    !lens.parameters.diameter.includes(diameter)
  ) {
    errors.push("Invalid diameter for this lens.");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
