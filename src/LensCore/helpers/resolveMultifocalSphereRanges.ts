import type { LensCore } from "../types";

type SphereRange = {
  min: number;
  max: number;
  step?: 0.25 | 0.5 | 1;
};

export function resolveMultifocalSphereRanges(
  lens: LensCore,
  add: string | null,
  baseCurve: number | null
): SphereRange[] {
  if (!lens.type.multifocal) return [];

  const groups = lens.parameters.multifocal?.groups ?? [];

  const matches = groups.filter((g) => {
    if (add && !g.adds.includes(add)) return false;

    if (baseCurve && g.baseCurve && g.baseCurve !== baseCurve) return false;

    return true;
  });

  return matches.map((g) => ({
    min: g.sphereRange.min,
    max: g.sphereRange.max,
    step: g.sphereStepOverride,
  }));
}