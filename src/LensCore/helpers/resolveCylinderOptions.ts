import type { LensCore } from "../types";

export function resolveCylinderOptions(
  lens: LensCore,
  axis: number | null,
  sph: number | null
): number[] {
  if (!lens.type.toric) return [];

  const groups = lens.parameters.toric?.groups ?? [];
  const cyls = new Set<number>();

  for (const g of groups) {
    if (!axis || !g.axis || g.axis.includes(axis)) {
      for (const c of g.cylinders) {
        cyls.add(c);
      }
    }
  }

  let result = Array.from(cyls).sort((a, b) => a - b);

  // XR rule (only for XR toric lenses)
  const isXRToric = lens.coreId.endsWith("_XR_AST");

  if (isXRToric && sph !== null) {
    const normalSphere = sph >= -8 && sph <= 6;

    if (normalSphere) {
      // XR cylinders are stronger than -2.25
      result = result.filter((c) => c < -2.25);
    }
  }

  return result;
}