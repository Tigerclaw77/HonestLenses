import assert from "node:assert/strict";

import { CORE_TO_SKUS } from "@/lib/pricing/resolveDefaultSku";
import { getPrice } from "@/lib/pricing/getPrice";
import { getSkuBoxDurationMonths } from "@/lib/pricing/skuDefaults";
import { resolveCartEyeBoxCounts } from "@/lib/cart/resolveQuantities";
import { deriveTotalMonths } from "@/lib/shipping";
import {
  EXPRESS_SHIPPING_CENTS,
  resolveShipping,
} from "@/lib/shipping/resolveShipping";

const allSkus = Object.values(CORE_TO_SKUS).flat();

assert.equal(
  getSkuBoxDurationMonths("OASYS_2W_24"),
  12,
  "ACUVUE OASYS 24-pack is the nominal annual-supply package",
);

const persistedOasysCounts = resolveCartEyeBoxCounts({
  hasRightEye: true,
  hasLeftEye: true,
  defaultPerEye: 1,
  storedRightBoxCount: 1,
  storedLeftBoxCount: 1,
});
assert.deepEqual(
  persistedOasysCounts,
  { right: 1, left: 1, totalBoxes: 2 },
  "persisted one-box-per-eye annual quantity remains canonical",
);

const oasysMonths = deriveTotalMonths({
  sku: "OASYS_2W_24",
  totalBoxes: persistedOasysCounts.totalBoxes,
  right_box_count: persistedOasysCounts.right,
  left_box_count: persistedOasysCounts.left,
});
assert.equal(oasysMonths, 12);
assert.deepEqual(
  resolveShipping({
    manufacturer: "vistakon",
    totalMonths: oasysMonths,
    itemCount: persistedOasysCounts.totalBoxes,
    shippingMethod: "standard",
  }),
  {
    shippingCents: 0,
    tier: "free_annual",
    label: "Free annual supply shipping",
    shippingMethod: "standard",
  },
);

const oneEyeOasysMonths = deriveTotalMonths({
  sku: "OASYS_2W_24",
  totalBoxes: 1,
  right_box_count: 1,
  left_box_count: null,
});
assert.equal(oneEyeOasysMonths, 12);
assert.equal(
  resolveShipping({
    manufacturer: "vistakon",
    totalMonths: oneEyeOasysMonths,
    itemCount: 1,
    shippingMethod: "standard",
  }).shippingCents,
  0,
  "one annual 24-pack for a single prescribed eye also ships free",
);

for (const sku of allSkus) {
  const monthsPerBox = getSkuBoxDurationMonths(sku);
  const boxesPerEye = Math.ceil(12 / monthsPerBox);
  const totalMonths = deriveTotalMonths({
    sku,
    totalBoxes: boxesPerEye * 2,
    right_box_count: boxesPerEye,
    left_box_count: boxesPerEye,
  });
  const manufacturer = getPrice({ sku, box_count: 1 }).manufacturer;
  const shipping = resolveShipping({
    manufacturer,
    totalMonths,
    itemCount: boxesPerEye * 2,
    shippingMethod: "standard",
  });

  assert.ok(totalMonths >= 12, `${sku} annual quantity reaches 12 months`);
  assert.equal(
    shipping.shippingCents,
    0,
    `${sku} annual quantity receives free standard shipping`,
  );
  assert.equal(shipping.tier, "free_annual");
}

for (const [manufacturer, expectedFlatRate] of [
  ["bausch", 1000],
  ["coopervision", 1500],
] as const) {
  const nonAnnual = resolveShipping({
    manufacturer,
    totalMonths: 6,
    itemCount: 2,
    shippingMethod: "standard",
  });
  const annual = resolveShipping({
    manufacturer,
    totalMonths: 12,
    itemCount: 4,
    shippingMethod: "standard",
  });

  assert.equal(nonAnnual.shippingCents, expectedFlatRate);
  assert.equal(annual.shippingCents, 0);
}

assert.equal(
  resolveShipping({
    manufacturer: "vistakon",
    totalMonths: 12,
    itemCount: 2,
    shippingMethod: "express",
  }).shippingCents,
  EXPRESS_SHIPPING_CENTS,
  "annual supply only waives standard shipping",
);

assert.notEqual(
  resolveShipping({
    manufacturer: "vistakon",
    totalMonths: 11,
    itemCount: 2,
    shippingMethod: "standard",
  }).shippingCents,
  0,
  "the annual threshold is not broadened below 12 months",
);

console.log(`Annual shipping matrix passed (${allSkus.length} SKUs)`);
