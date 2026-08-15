import {
  HONEST_PRICE_COMPARISONS,
  type HonestPriceComparison,
} from "@/data/honestPriceComparisons";

export const HONEST_PRICE_MAX_AGE_DAYS = 31;

export type HonestPriceLookup = {
  coreId: string;
  sku?: string | null;
  normalizedBoxCount?: number | null;
};

function isPositiveInteger(value: number) {
  return Number.isSafeInteger(value) && value > 0;
}

export function isValidHonestPriceComparison(
  comparison: HonestPriceComparison,
  now = new Date(),
) {
  const checkedAt = new Date(comparison.checkedAt);
  const ageMs = now.getTime() - checkedAt.getTime();
  const maxAgeMs = HONEST_PRICE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

  return (
    Boolean(comparison.coreId.trim()) &&
    Boolean(comparison.sku.trim()) &&
    Boolean(comparison.productName.trim()) &&
    isPositiveInteger(comparison.boxSize) &&
    isPositiveInteger(comparison.normalizedBoxCount) &&
    Boolean(comparison.competitor.name.trim()) &&
    comparison.honestLenses.requiresRebate === false &&
    isPositiveInteger(comparison.honestLenses.immediateTotalCents) &&
    isPositiveInteger(comparison.competitor.immediateTotalCents) &&
    comparison.competitor.immediateTotalCents >
      comparison.honestLenses.immediateTotalCents &&
    Number.isFinite(checkedAt.getTime()) &&
    ageMs >= 0 &&
    ageMs <= maxAgeMs
  );
}

export function findHonestPriceComparison(
  comparisons: readonly HonestPriceComparison[],
  {
  coreId,
  sku,
  normalizedBoxCount,
}: HonestPriceLookup,
  now = new Date(),
): HonestPriceComparison | null {
  if (
    !coreId.trim() ||
    !sku?.trim() ||
    !isPositiveInteger(normalizedBoxCount ?? 0)
  ) {
    return null;
  }

  return (
    comparisons.find(
      (comparison) =>
        comparison.coreId === coreId &&
        comparison.sku === sku &&
        comparison.normalizedBoxCount === normalizedBoxCount &&
        isValidHonestPriceComparison(comparison, now),
    ) ?? null
  );
}

export function getHonestPriceComparison(
  lookup: HonestPriceLookup,
): HonestPriceComparison | null {
  return findHonestPriceComparison(HONEST_PRICE_COMPARISONS, lookup);
}
