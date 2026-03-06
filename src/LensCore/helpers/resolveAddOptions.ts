import type { LensCore } from "../types";

export function resolveAddOptions(
  lens: LensCore,
  baseCurve: number | null,
  sphere: number | null
): string[] {
  if (!lens) return [];
  if (!lens.type.multifocal) return [];

  const mf = lens.parameters.multifocal;
  if (!mf) return [];

  const allAdds = [...mf.adds, ...(mf.xrAdds ?? [])];

  const result = [...allAdds];

  const isXRMF = lens.coreId.includes("_XR_MF");

  if (!isXRMF) return result;

  /* -------------------------
     BC 8.4 → XR ONLY BASE CURVE
     No restrictions
  ------------------------- */

  if (baseCurve === 8.4) {
    return result;
  }

  /* -------------------------
     BC 8.7 → hybrid rules
  ------------------------- */

  if (baseCurve === 8.7) {

  if (sphere == null) {
    return result.filter((a) => mf.xrAdds?.includes(a));
  }

  const xrSphere =
    sphere >= 6.25 || sphere <= -8.5;

  if (xrSphere) {
    return result; // unlock all adds
  }

  // normal MF sphere range
  return result.filter((a) => mf.xrAdds?.includes(a));
}

  return result;
}
