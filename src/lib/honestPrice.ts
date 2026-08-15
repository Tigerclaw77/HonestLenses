import {
  HONEST_PRICE_COMPARISONS,
  type HonestPriceComparison,
} from "@/data/honestPriceComparisons";

export const HONEST_PRICE_MAX_AGE_DAYS = 31;

export type HonestPriceLookup = {
  coreId: string;
  sku?: string | null;
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

export function getHonestPriceComparison({
  coreId,
  sku,
}: HonestPriceLookup): HonestPriceComparison | null {
  if (!coreId.trim()) return null;

  return (
    HONEST_PRICE_COMPARISONS.find(
      (comparison) =>
        comparison.coreId === coreId &&
        (!sku?.trim() || comparison.sku === sku) &&
        isValidHonestPriceComparison(comparison),
    ) ?? null
  );
}
