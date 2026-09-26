const CATEGORICAL_ADD_ALIASES: Readonly<Record<string, string>> = {
  LO: "LOW",
  LOW: "LOW",
  MID: "MEDIUM",
  MED: "MEDIUM",
  MEDIUM: "MEDIUM",
  HI: "HIGH",
  HIGH: "HIGH",
};

/**
 * Preserve the value printed on the prescription while removing formatting
 * noise that should not create a false mismatch.
 */
export function normalizePrescriptionAdd(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return normalized || null;
}

export function normalizePrescriptionAddForDisplay(
  value: number | string | null | undefined,
): number | string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? Number(value.toFixed(2)) : null;
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric)
    ? Number(numeric.toFixed(2))
    : normalizePrescriptionAdd(trimmed);
}

function comparablePrescriptionAdd(value: unknown): string | null {
  const normalized = normalizePrescriptionAdd(value);
  if (!normalized) return null;
  return CATEGORICAL_ADD_ALIASES[normalized] ?? normalized.replace(/\s+/g, "");
}

export function canonicalPrescriptionAdd(
  value: unknown,
  allowedOptions: readonly string[] = [],
): string | null {
  const normalized = normalizePrescriptionAdd(value);
  if (!normalized) return null;
  return (
    allowedOptions.find((option) =>
      prescriptionAddsEquivalent(normalized, option),
    ) ?? normalized
  );
}

/**
 * Product catalogs and prescribers use MID/MED and LOW/LO or HIGH/HI
 * interchangeably. Equality is product-gated elsewhere; this only prevents
 * those labels from becoming a false parameter mismatch.
 */
export function prescriptionAddsEquivalent(
  left: unknown,
  right: unknown,
): boolean {
  const leftComparable = comparablePrescriptionAdd(left);
  const rightComparable = comparablePrescriptionAdd(right);
  return (
    leftComparable !== null &&
    rightComparable !== null &&
    leftComparable === rightComparable
  );
}
