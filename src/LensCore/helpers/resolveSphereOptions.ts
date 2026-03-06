import type { LensCore } from "../types";
import { toPowerList } from "@/LensCore";
import { resolveToricOptions } from "./resolveToricOptions";

function isStandardToricCylinder(cyl: number): boolean {
  // Standard toric cylinders
  return cyl === -0.75 || cyl === -1.25 || cyl === -1.75 || cyl === -2.25;
}

function applyXrToricSphereGuard(
  lens: LensCore,
  cylinder: number | null,
  baseCurve: number | null,
  opts: number[],
): number[] {
  if (cylinder == null) return opts;
  if (!lens.type.toric) return opts;

  // Only applies to XR toric SKUs
  if (!lens.coreId.endsWith("_XR_AST")) return opts;

  // Only when a standard cylinder is chosen
  if (!isStandardToricCylinder(cylinder)) return opts;

  /* ---------- BIOFINITY XR TORIC ---------- */

  if (lens.coreId === "BIOFINITY_XR_AST") {
    // Standard Biofinity toric sphere envelope = -10.00 → +8.00
    // XR-only spheres = outside that range
    return opts.filter((s) => s <= -10.5 || s >= 8.5);
  }

  /* ---------- PROCLEAR XR TORIC ---------- */

  if (lens.coreId === "PROCLEAR_XR_AST") {
    // BC 8.4 → full XR envelope (no filtering)
    if (baseCurve === 8.4) {
      return opts;
    }

    // BC 8.8 behaves like Biofinity XR toric
    return opts.filter((s) => s <= -7.0 || s >= 7.0);
  }

  return opts;
}

export function resolveSphereOptions(
  lens: LensCore,
  baseCurve: number | null,
  cylinder: number | null,
  axis: number | null,
  add: string | null,
): number[] {
  const params = lens.parameters;

  const spec =
    params.sphereByBaseCurve && baseCurve != null
      ? (params.sphereByBaseCurve.find((x) =>
          Array.isArray(x.baseCurve)
            ? x.baseCurve.includes(baseCurve)
            : x.baseCurve === baseCurve,
        )?.spec ?? null)
      : (params.sphere ?? null);

  if (!spec) return [];

  let opts = toPowerList(spec);

  /* ---------- XR TORIC GUARD ---------- */

  opts = applyXrToricSphereGuard(lens, cylinder, baseCurve, opts);

  /* ---------- TORIC RANGE FILTERING ---------- */

  if (params.toric && cylinder != null && axis != null) {
    const validRanges = resolveToricOptions(lens, cylinder, axis);

    if (validRanges.length > 0) {
      opts = opts.filter((sphere) =>
        validRanges.some((range) => sphere >= range.min && sphere <= range.max),
      );
    }
  }

  /* ---------- MULTIFOCAL XR RULE ---------- */

  if (lens.type.multifocal && add && baseCurve === 8.7) {
    const mf = lens.parameters.multifocal;

    if (mf?.xrAdds && mf.adds.includes(add)) {
      opts = opts.filter((sphere) => sphere >= 6.25 || sphere <= -8.5);
    }
  }

  return opts;
}
