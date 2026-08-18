import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { getAuthoritativeOrderQuote } from "@/lib/orders/orderPricing";
import {
  convertEquivalentPackQuantity,
  getNextSmallerPackSizeOption,
  getPackSizeOptionsForCoreId,
  isSkuAvailableForCoreId,
} from "./packSizeOptions";
import { getQuantityOptionsWithSelectedValue } from "@/lib/cart/quantityConfig";
import {
  getLensFamilyQuantityReset,
  hasLensFamilySelectionChanged,
} from "@/lib/orders/rxFamilyChange";

const options = getPackSizeOptionsForCoreId("OASYS_2W");
assert.deepEqual(
  options.map(({ sku, packSize }) => ({ sku, packSize })),
  [
    { sku: "OASYS_2W_12", packSize: 12 },
    { sku: "OASYS_2W_24", packSize: 24 },
  ],
);

const large = options.find((option) => option.sku === "OASYS_2W_24")!;
const small = getNextSmallerPackSizeOption("OASYS_2W", large.sku)!;
assert.equal(small.sku, "OASYS_2W_12");
assert.equal(convertEquivalentPackQuantity(1, large, small), 2);
assert.equal(convertEquivalentPackQuantity(2, small, large), 1);
assert.equal(convertEquivalentPackQuantity(1, small, large), null);
assert.equal(
  isSkuAvailableForCoreId("OASYS_2W_AST", "OASYS_2W_12"),
  false,
);

const largeQuote = getAuthoritativeOrderQuote({
  sku: large.sku,
  totalBoxes: 2,
  rightBoxCount: 1,
  leftBoxCount: 1,
  shippingMethod: "standard",
});
const smallQuote = getAuthoritativeOrderQuote({
  sku: small.sku,
  totalBoxes: 4,
  rightBoxCount: 2,
  leftBoxCount: 2,
  shippingMethod: "standard",
});

assert.equal(large.packSize * 2, small.packSize * 4);
assert.equal(largeQuote.totalMonths, 12);
assert.equal(smallQuote.totalMonths, 12);
assert.equal(largeQuote.shippingCents, 0);
assert.equal(smallQuote.shippingCents, 0);
assert.equal(largeQuote.productSubtotalCents, 27_598);
assert.equal(smallQuote.productSubtotalCents, 29_196);
assert.notEqual(largeQuote.totalAmountCents, smallQuote.totalAmountCents);

const workspaceRoot = process.cwd();
const cartPage = readFileSync(
  join(workspaceRoot, "src", "app", "cart", "page.tsx"),
  "utf8",
);
const resolveRoute = readFileSync(
  join(workspaceRoot, "src", "app", "api", "cart", "resolve", "route.ts"),
  "utf8",
);
assert.match(cartPage, /Prefer smaller boxes\?/);
assert.match(cartPage, /Same prescribed lenses\s+and total lens quantity/);
assert.match(resolveRoute, /Requested pack size is not available for this lens/);
assert.match(
  resolveRoute,
  /requestedSku \?\? storedSku \?\? resolveDefaultSku/,
  "the explicit pack choice must survive later quantity and shipping resolves",
);
assert.match(
  resolveRoute,
  /hasCompatibleStoredQuantity = storedSku !== null/,
  "quantities from an incompatible prior lens family must not survive SKU resolution",
);
assert.deepEqual(
  getQuantityOptionsWithSelectedValue([0, 1, 2, 3, 4], 12),
  [0, 1, 2, 3, 4, 12],
  "a converted quantity remains selectable even when it exceeds the normal cap",
);

const claritiRx = {
  right: { coreId: "CLARITI_1D" },
  left: { coreId: "CLARITI_1D" },
};
const oasysRx = {
  right: { coreId: "OASYS_2W" },
  left: { coreId: "OASYS_2W" },
};
assert.equal(hasLensFamilySelectionChanged(claritiRx, oasysRx), true);
assert.deepEqual(getLensFamilyQuantityReset(claritiRx, oasysRx), {
  right_box_count: null,
  left_box_count: null,
  total_box_count: null,
  box_count: 0,
  adjusted_right_box_count: null,
  adjusted_left_box_count: null,
  adjusted_total_box_count: null,
  order_quantity_adjustment_reason: null,
  order_quantity_adjusted_by: null,
  order_quantity_adjusted_at: null,
});
assert.equal(
  hasLensFamilySelectionChanged(oasysRx, {
    right: { ...oasysRx.right, power: "-2.25" },
    left: { ...oasysRx.left, power: "-1.75" },
  }),
  false,
  "same-family prescription changes preserve reviewed quantities",
);

console.log("Equivalent pack-size choice regression checks passed");
