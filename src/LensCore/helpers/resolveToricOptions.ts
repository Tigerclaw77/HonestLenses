import type { LensCore } from "../types";

type SphereRange = {
  min: number;
  max: number;
};

export function resolveToricOptions(
  lens: LensCore,
  cylinder: number,
  axis: number,
): SphereRange[] {
  const groups = lens.parameters.toric?.groups ?? [];

  const group = groups.find((g) =>
    g.cylinders.includes(cylinder),
  );

  if (!group) return [];

  if (!group.sphereAxisRules) {
    if (!group.axis || !group.axis.includes(axis)) {
      return [];
    }

    const spec = lens.parameters.sphere;
    if (!spec) return [];

    return spec.segments.map((s) => ({
      min: s.min,
      max: s.max,
    }));
  }

  return group.sphereAxisRules
    .filter((rule) => rule.axis.includes(axis))
    .map((rule) => ({
      min: rule.sphereRange.min,
      max: rule.sphereRange.max,
    }));
}