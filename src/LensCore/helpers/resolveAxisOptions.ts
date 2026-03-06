import type { LensCore } from "../types";

type SphereRange = {
  min: number;
  max: number;
};

type SphereAxisRule = {
  sphereRange: SphereRange;
  axis: readonly number[];
};

export function resolveAxisOptions(
  lens: LensCore | undefined,
  cyl: number | null,
  sphere: number | null,
): number[] {
  if (!lens?.type.toric) return [];

  const groups = lens.parameters.toric?.groups ?? [];
  if (groups.length === 0) return [];

  const axisSet = new Set<number>();

  if (cyl == null) {
  for (const group of groups) {
    // If sphereAxisRules exist
    if ("sphereAxisRules" in group && group.sphereAxisRules) {
      // If sphere selected → match rule
      if (sphere != null) {
        const rule = group.sphereAxisRules.find(
          (r: SphereAxisRule) =>
            sphere >= r.sphereRange.min &&
            sphere <= r.sphereRange.max
        );

        if (rule) {
          rule.axis.forEach((a) => axisSet.add(a));
        }
      } else {
        // sphere not selected → union rules
        for (const rule of group.sphereAxisRules) {
          rule.axis.forEach((a) => axisSet.add(a));
        }
      }
    }

    // fallback simple axis
    if ("axis" in group && group.axis) {
      group.axis.forEach((a) => axisSet.add(a));
    }
  }

  return Array.from(axisSet).sort((a, b) => a - b);
}

  // 🔹 Cylinder selected → find matching group
  const group = groups.find((g) => g.cylinders.includes(cyl));
  if (!group) return [];

  // 🔹 If sphereAxisRules exist
  if ("sphereAxisRules" in group && group.sphereAxisRules) {
    // If sphere not selected yet → union of rule axes
    if (sphere == null) {
      for (const rule of group.sphereAxisRules) {
        rule.axis.forEach((a) => axisSet.add(a));
      }
      return Array.from(axisSet).sort((a, b) => a - b);
    }

    // Sphere selected → match rule
    const rule = group.sphereAxisRules.find(
      (r: SphereAxisRule) =>
        sphere >= r.sphereRange.min && sphere <= r.sphereRange.max,
    );

    if (rule) {
      return [...rule.axis].sort((a, b) => a - b);
    }

    return [];
  }

  // 🔹 Simple group axis
  if ("axis" in group && group.axis) {
    return [...group.axis].sort((a, b) => a - b);
  }

  return [];
}