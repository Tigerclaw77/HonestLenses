import assert from "node:assert/strict";

import {
  getAnnualSupplyEstimate,
  getPricePerLensCents,
  getPricePerWearingDayCents,
  getSupplyEstimate,
} from "./productEconomics";

assert.equal(getPricePerLensCents(10_399, 90), 10_399 / 90);
assert.equal(
  getPricePerWearingDayCents({
    pricePerBoxCents: 10_399,
    boxSize: 90,
    replacement: "DD",
  }),
  10_399 / 90,
);
assert.equal(
  getPricePerWearingDayCents({
    pricePerBoxCents: 10_000,
    boxSize: 10,
    replacement: "1M",
  }),
  10_000 / 10 / 30,
);
assert.deepEqual(
  getAnnualSupplyEstimate({
    monthsPerBox: 3,
    pricePerBoxCents: 10_399,
    eyeCount: 2,
  }),
  { boxesPerEye: 4, totalBoxes: 8, totalPriceCents: 83_192 },
);
assert.deepEqual(
  getAnnualSupplyEstimate({
    monthsPerBox: 12,
    pricePerBoxCents: 15_000,
    eyeCount: 1,
  }),
  { boxesPerEye: 1, totalBoxes: 1, totalPriceCents: 15_000 },
);

const estimate = (
  durationMonths: 1 | 3 | 6 | 12,
  boxSize: number,
  replacement: string,
  eyeMode: "one" | "both-same" | "both-different",
) => getSupplyEstimate({
  durationMonths,
  boxSize,
  replacement,
  pricePerBoxCents: 10_000,
  eyeMode,
});

// Daily 30- and 90-packs are different purchase quantities for the same lens.
assert.deepEqual(
  [1, 3, 6, 12].map((months) => estimate(months as 1 | 3 | 6 | 12, 30, "DD", "both-different").totalBoxes),
  [2, 6, 12, 24],
);
assert.deepEqual(
  [1, 3, 6, 12].map((months) => estimate(months as 1 | 3 | 6 | 12, 90, "DD", "both-different").totalBoxes),
  [2, 2, 4, 8],
);
assert.equal(estimate(12, 90, "DD", "one").totalBoxes, 4);

// Reusable lenses round to whole packs; identical eye values can share a box.
assert.equal(estimate(1, 6, "1M", "one").totalBoxes, 1);
assert.equal(estimate(1, 6, "1M", "both-same").totalBoxes, 1);
assert.equal(estimate(1, 6, "1M", "both-different").totalBoxes, 2);
assert.equal(estimate(6, 6, "1M", "both-different").totalBoxes, 2);
assert.equal(estimate(12, 6, "1M", "both-different").totalBoxes, 4);
assert.equal(estimate(12, 12, "2W", "one").lensesPerEye, 26);
assert.equal(estimate(12, 12, "2W", "one").totalBoxes, 3);
assert.equal(estimate(12, 24, "2W", "both-different").totalBoxes, 4);

console.log("Product economics tests passed");
