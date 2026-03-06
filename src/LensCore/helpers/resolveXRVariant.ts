import type { LensCore } from "../types";
import { lenses } from "..";
import { resolveSphereOptions } from "../helpers/resolveSphereOptions";
import { resolveAxisOptions } from "../helpers/resolveAxisOptions";

type Params = {
  sph: number;
  cyl?: number | null;
  axis?: number | null;
  bc?: number | null;
};

/* ======================================================
   Helpers
====================================================== */

function uniqSorted(nums: number[]): number[] {
  return Array.from(new Set(nums)).sort((a, b) => a - b);
}

function getCylOptions(lens: LensCore): number[] {
  if (!lens.type.toric) return [];
  const groups = lens.parameters.toric?.groups ?? [];
  const out: number[] = [];
  for (const g of groups) {
    for (const c of g.cylinders) out.push(c);
  }
  return uniqSorted(out);
}

/**
 * "Hard availability" check:
 * - sphere must be allowed (given bc/cyl/axis)
 * - if toric and axis provided, axis must be allowed (given cyl/sph)
 *
 * IMPORTANT: this is strict combo validity for a specific lens.
 */
function comboAvailable(lens: LensCore, p: Params): boolean {
  // Sphere
  const sphereOptions = resolveSphereOptions(
    lens,
    p.bc ?? null,
    p.cyl ?? null,
    p.axis ?? null,
  );

  if (sphereOptions.length > 0 && !sphereOptions.includes(p.sph)) {
    return false;
  }

  // Axis (only if toric and axis provided)
  if (lens.type.toric && p.axis != null) {
    const axisOptions = resolveAxisOptions(lens, p.cyl ?? null, p.sph);
    if (axisOptions.length > 0 && !axisOptions.includes(p.axis)) {
      return false;
    }
  }

  return true;
}

/**
 * XR must NOT be selected unless at least one XR-trigger is true:
 * - SPH is not available in base lens (ignoring axis), OR
 * - CYL is not available in base lens
 *
 * Axis-only “differences” are NOT an XR trigger.
 */
function triggersXR(base: LensCore, p: Params): boolean {
  // If toric, check cylinder first
  if (base.type.toric) {
    const baseCyls = getCylOptions(base);
    if (p.cyl != null && baseCyls.length > 0 && !baseCyls.includes(p.cyl)) {
      return true; // cyl beyond base => XR trigger
    }
  }

  // Sphere check MUST ignore axis (axis never triggers XR)
  const baseSphereIgnoringAxis = resolveSphereOptions(
    base,
    p.bc ?? null,
    p.cyl ?? null,
    null, // <— ignore axis on purpose
  );

  if (
    baseSphereIgnoringAxis.length > 0 &&
    !baseSphereIgnoringAxis.includes(p.sph)
  ) {
    return true; // sph beyond base => XR trigger
  }

  return false;
}

function getXRVariant(base: LensCore): LensCore | null {
  // Current convention: *_AST => *_XR_AST
  // (If later you add sphere XR, you can extend this mapping.)
  const xrId = base.coreId.replace(/_AST$/, "_XR_AST");
  const found = lenses.find((l) => l.coreId === xrId);
  return found ?? null;
}

/* ======================================================
   Public API
====================================================== */

/**
 * Returns the XR lens ONLY when:
 * 1) base cannot support the Rx combo, AND
 * 2) XR-trigger is true (sph outside base OR cyl outside base), AND
 * 3) XR actually supports the Rx combo
 *
 * Otherwise returns null.
 */
export function resolveXRVariant(base: LensCore, params: Params): LensCore | null {
  // If base supports the exact combo, no XR.
  if (comboAvailable(base, params)) return null;

  // If base fails ONLY due to axis, do NOT switch to XR.
  // (This is enforced by triggersXR ignoring axis.)
  if (!triggersXR(base, params)) return null;

  const xr = getXRVariant(base);
  if (!xr) return null;

  // XR must actually support the combo (strict).
  if (comboAvailable(xr, params)) return xr;

  return null;
}