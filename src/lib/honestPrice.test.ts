import assert from "node:assert/strict";

import {
  HONEST_PRICE_MAX_AGE_DAYS,
  findHonestPriceComparison,
  getHonestPriceComparison,
  isValidHonestPriceComparison,
} from "./honestPrice";

const today = new Date("2026-08-14T12:00:00.000Z");
const validComparison = {
  coreId: "OASYS_1D",
  sku: "OASYS_1D_90",
  productName: "ACUVUE OASYS 1-Day",
  boxSize: 90,
  normalizedBoxCount: 2,
  honestLenses: { immediateTotalCents: 16996, requiresRebate: false as const },
  competitor: { name: "Example retailer", immediateTotalCents: 21996 },
  checkedAt: "2026-08-01T12:00:00.000Z",
};

assert.equal(isValidHonestPriceComparison(validComparison, today), true);
assert.equal(
  findHonestPriceComparison(
    [validComparison],
    {
      coreId: validComparison.coreId,
      sku: validComparison.sku,
      normalizedBoxCount: validComparison.normalizedBoxCount,
    },
    today,
  ),
  validComparison,
  "an exact current fixture is eligible to render",
);
assert.equal(
  findHonestPriceComparison(
    [validComparison],
    {
      coreId: validComparison.coreId,
      sku: validComparison.sku,
      normalizedBoxCount: validComparison.normalizedBoxCount + 1,
    },
    today,
  ),
  null,
  "a quantity-mismatched fixture never renders",
);
assert.equal(
  findHonestPriceComparison(
    [validComparison],
    {
      coreId: validComparison.coreId,
      sku: "OTHER_SKU",
      normalizedBoxCount: validComparison.normalizedBoxCount,
    },
    today,
  ),
  null,
  "a SKU-mismatched fixture never renders",
);
const staleComparison = {
  ...validComparison,
  checkedAt: new Date(
    today.getTime() - (HONEST_PRICE_MAX_AGE_DAYS + 1) * 24 * 60 * 60 * 1000,
  ).toISOString(),
};
assert.equal(
  findHonestPriceComparison(
    [staleComparison],
    {
      coreId: staleComparison.coreId,
      sku: staleComparison.sku,
      normalizedBoxCount: staleComparison.normalizedBoxCount,
    },
    today,
  ),
  null,
  "a stale fixture never renders",
);
const nonWinningComparison = {
  ...validComparison,
  competitor: { name: "Example retailer", immediateTotalCents: 16996 },
};
assert.equal(
  findHonestPriceComparison(
    [nonWinningComparison],
    {
      coreId: nonWinningComparison.coreId,
      sku: nonWinningComparison.sku,
      normalizedBoxCount: nonWinningComparison.normalizedBoxCount,
    },
    today,
  ),
  null,
  "a non-winning fixture never renders",
);
assert.equal(
  getHonestPriceComparison({
    coreId: validComparison.coreId,
    sku: validComparison.sku,
    normalizedBoxCount: validComparison.normalizedBoxCount,
  }),
  null,
  "the empty curated table renders no comparison",
);
assert.equal(
  isValidHonestPriceComparison(
    { ...validComparison, competitor: { name: "", immediateTotalCents: 21996 } },
    today,
  ),
  false,
);
assert.equal(
  isValidHonestPriceComparison(
    {
      ...validComparison,
      competitor: { name: "Example retailer", immediateTotalCents: 16996 },
    },
    today,
  ),
  false,
);
assert.equal(
  isValidHonestPriceComparison(
    {
      ...validComparison,
      checkedAt: new Date(
        today.getTime() - (HONEST_PRICE_MAX_AGE_DAYS + 1) * 24 * 60 * 60 * 1000,
      ).toISOString(),
    },
    today,
  ),
  false,
);

console.log("Honest Price comparison validation passed");
