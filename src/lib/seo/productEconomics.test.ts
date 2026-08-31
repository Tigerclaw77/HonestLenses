import assert from "node:assert/strict";

import {
  getAnnualSupplyEstimate,
  getPricePerLensCents,
  getPricePerWearingDayCents,
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

console.log("Product economics tests passed");
