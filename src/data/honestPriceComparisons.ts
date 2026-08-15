export type HonestPriceComparison = {
  coreId: string;
  sku: string;
  productName: string;
  boxSize: number;
  normalizedBoxCount: number;
  honestLenses: {
    immediateTotalCents: number;
    requiresRebate: false;
  };
  competitor: {
    name: string;
    immediateTotalCents: number;
    conditionalTerms?: readonly string[];
  };
  checkedAt: string;
};

// This list is deliberately opt-in. Add an entry only after a human verifies
// the same exact product, box size, normalized quantity, and purchase terms.
// The renderer rejects entries that are incomplete, stale, or do not show an
// immediate-price advantage for Honest Lenses.
export const HONEST_PRICE_COMPARISONS: readonly HonestPriceComparison[] = [];
