import type { LensCore } from "@/LensCore/types";
import { slugifyLens } from "@/lib/seo/slugifyLens";

export const SITE_URL = "https://honestlenses.com";

export const CONTACT_PARAMETER_KEYS = [
  "base-curve",
  "diameter",
  "cylinder",
] as const;

export type ContactParameterKey = (typeof CONTACT_PARAMETER_KEYS)[number];

export const CONTACT_CONDITIONS = ["astigmatism", "presbyopia"] as const;

export type ContactCondition = (typeof CONTACT_CONDITIONS)[number];

export function getLensSlug(lens: LensCore) {
  return slugifyLens(lens.displayName);
}

export function findLensBySlug(lenses: LensCore[], slug: string) {
  return lenses.find((lens) => getLensSlug(lens) === slug) ?? null;
}

export function isContactParameterKey(
  parameter: string,
): parameter is ContactParameterKey {
  return CONTACT_PARAMETER_KEYS.includes(parameter as ContactParameterKey);
}

export function isContactCondition(
  condition: string,
): condition is ContactCondition {
  return CONTACT_CONDITIONS.includes(condition as ContactCondition);
}

export function getReadableParameter(parameter: ContactParameterKey) {
  if (parameter === "base-curve") return "base curve";
  return parameter;
}

export function getReadableCondition(condition: ContactCondition) {
  if (condition === "astigmatism") return "astigmatism";
  return "presbyopia";
}

export function formatSeoValue(value: number) {
  return Number.isInteger(value) ? String(value) : String(value);
}

function uniqueSorted(values: number[]) {
  return [...new Set(values)].sort((a, b) => a - b);
}

function getCylinderValues(lens: LensCore) {
  return uniqueSorted(
    (lens.parameters.toric?.groups ?? []).flatMap((group) => group.cylinders),
  );
}

export function getLensParameterValues(
  lens: LensCore,
  parameter: ContactParameterKey,
) {
  if (parameter === "base-curve") {
    return uniqueSorted(lens.parameters.baseCurve ?? []);
  }

  if (parameter === "diameter") {
    return uniqueSorted(lens.parameters.diameter ?? []);
  }

  return getCylinderValues(lens);
}

export function hasLensParameterValue(
  lens: LensCore,
  parameter: ContactParameterKey,
  value: string,
) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return false;
  }

  return getLensParameterValues(lens, parameter).includes(numericValue);
}

export function getParameterIndexLensMatches(
  lenses: LensCore[],
  parameter: ContactParameterKey,
  value: string,
) {
  return lenses.filter((lens) =>
    hasLensParameterValue(lens, parameter, value),
  );
}

export function getConditionLensMatches(
  lenses: LensCore[],
  condition: ContactCondition,
) {
  if (condition === "astigmatism") {
    return lenses.filter((lens) => lens.type.toric);
  }

  return lenses.filter((lens) => lens.type.multifocal);
}

export function getParameterIndexRoutes(lenses: LensCore[]) {
  return CONTACT_PARAMETER_KEYS.flatMap((parameter) => {
    const values = uniqueSorted(
      lenses.flatMap((lens) => getLensParameterValues(lens, parameter)),
    );

    return values.map((value) => ({
      parameter,
      value: formatSeoValue(value),
    }));
  });
}

export function getLensParameterRoutes(lenses: LensCore[]) {
  return lenses.flatMap((lens) => {
    const slug = getLensSlug(lens);

    return CONTACT_PARAMETER_KEYS.flatMap((parameter) =>
      getLensParameterValues(lens, parameter).map((value) => ({
        slug,
        parameter,
        value: formatSeoValue(value),
      })),
    );
  });
}

export function getConditionRoutes(lenses: LensCore[]) {
  return CONTACT_CONDITIONS.filter(
    (condition) => getConditionLensMatches(lenses, condition).length > 0,
  );
}
