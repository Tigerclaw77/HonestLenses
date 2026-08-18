import assert from "node:assert/strict";
import test from "node:test";
import {
  convertPackSizeQuantity,
  canChangeOrderPackSize,
  getNextSmallerPackSizeOption,
  getOrderPackCoreId,
  getPackSizeOptionsForCoreId,
  isSkuAvailableForCoreId,
  getPersistedPackSku,
} from "./packSizeSelection";
import {
  buildQuantityConfig,
  getQuantityOptionsWithSelectedValue,
} from "./quantityConfig";
import { resolveCartEyeBoxCounts } from "./resolveQuantities";
import { getAuthoritativeOrderQuote } from "@/lib/orders/orderPricing";
import { checkoutAmountMatchesPaymentIntent, getCheckoutAmountCents } from "@/lib/payments/checkoutAmount";
import { resolveOrderManufacturer } from "@/lib/orders/skuManufacturer";
import {
  getLensFamilyQuantityReset,
  hasLensFamilySelectionChanged,
} from "@/lib/orders/rxFamilyChange";

const MULTI_PACK_FAMILIES = [
  "OASYS_MAX_1D", "OASYS_MAX_1D_MF", "OASYS_1D_AST", "OASYS_2W",
  "MOIST", "MOIST_AST", "MOIST_MF", "VITA", "DT1", "DT1_AST", "DT1_MF",
  "PRECISION1", "PRECISION1_AST", "PRECISION7", "PRECISION7_AST", "AO_COL",
  "DACP", "DACP_AST", "DACP_MF", "DAILIES_COL", "BIOTRUE_1D",
  "BIOTRUE_1D_AST", "BIOTRUE_1D_MF", "CLARITI_1D", "CLARITI_1D_AST",
  "CLARITI_1D_MF", "MYDAY",
] as const;

test("derives every current multi-pack family from the catalog map", () => {
  assert.equal(MULTI_PACK_FAMILIES.length, 27);
  for (const coreId of MULTI_PACK_FAMILIES) {
    assert.ok(getPackSizeOptionsForCoreId(coreId).length > 1, coreId);
  }
});

test("switches OASYS 24 to the next smaller 12 pack and preserves supply", () => {
  assert.equal(getNextSmallerPackSizeOption("OASYS_2W", "OASYS_2W_24")?.sku, "OASYS_2W_12");
  assert.equal(getNextSmallerPackSizeOption("OASYS_2W", "OASYS_2W_12"), null);
  assert.equal(convertPackSizeQuantity(1, "OASYS_2W_24", "OASYS_2W_12"), 2);
  const quote = getAuthoritativeOrderQuote({ sku: "OASYS_2W_12", totalBoxes: 4, rightBoxCount: 2, leftBoxCount: 2 });
  assert.equal(quote.totalMonths, 12);
  assert.equal(quote.shippingCents, 0);
  assert.equal(quote.sku, "OASYS_2W_12");
  assert.equal(quote.manufacturer, "vistakon");
  assert.equal(resolveOrderManufacturer(quote.manufacturer, quote.sku), "vistakon");
  assert.equal(getCheckoutAmountCents({ id: "order", total_amount_cents: quote.totalAmountCents, feedback_credit_cents: 0 }), quote.totalAmountCents);
  assert.equal(
    checkoutAmountMatchesPaymentIntent(
      { id: "order", total_amount_cents: quote.totalAmountCents, feedback_credit_cents: 0 },
      quote.totalAmountCents,
    ),
    true,
  );
});

test("rejects cross-family choices and does not offer order-level switches for mixed eyes", () => {
  assert.equal(isSkuAvailableForCoreId("OASYS_2W", "MOIST_30"), false);
  assert.equal(getOrderPackCoreId({ rightCoreId: "OASYS_2W", leftCoreId: "MOIST" }), null);
});

test("a prior lens family cannot carry quantities into a clariti annual cart", () => {
  assert.equal(getPersistedPackSku("CLARITI_1D", "DT1_30", true), null);
  assert.deepEqual(
    resolveCartEyeBoxCounts({
      hasRightEye: true,
      hasLeftEye: true,
      defaultPerEye: 4,
      storedRightBoxCount: 18,
      storedLeftBoxCount: 18,
      hasStoredRightBoxCount: false,
      hasStoredLeftBoxCount: false,
    }),
    { right: 4, left: 4, totalBoxes: 8 },
  );
});

test("an Rx family change clears stale quantities before its SKU is overwritten", () => {
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

  // The cleared fields cause the normal resolver to use OASYS 24-pack defaults,
  // even when the old clariti draft held an implausible 54 / 54 selection.
  const resolved = resolveCartEyeBoxCounts({
    hasRightEye: true,
    hasLeftEye: true,
    defaultPerEye: 1,
    storedRightBoxCount: 54,
    storedLeftBoxCount: 54,
    hasStoredRightBoxCount: false,
    hasStoredLeftBoxCount: false,
  });
  assert.deepEqual(resolved, { right: 1, left: 1, totalBoxes: 2 });

  const quote = getAuthoritativeOrderQuote({
    sku: "OASYS_2W_24",
    totalBoxes: resolved.totalBoxes,
    rightBoxCount: resolved.right,
    leftBoxCount: resolved.left,
  });
  assert.equal(quote.shippingCents, 0);
  assert.equal(quote.manufacturer, "vistakon");
  assert.equal(resolveOrderManufacturer(quote.manufacturer, quote.sku), "vistakon");
  assert.equal(getCheckoutAmountCents({ id: "oasys", total_amount_cents: quote.totalAmountCents, feedback_credit_cents: 0 }), quote.totalAmountCents);
  assert.equal(getPersistedPackSku("OASYS_2W", "OASYS_2W_24", true), "OASYS_2W_24");
  assert.equal(convertPackSizeQuantity(resolved.right, "OASYS_2W_24", "OASYS_2W_12"), 2);
});

test("same-family Rx updates preserve adjustments while either asymmetric eye change resets both", () => {
  const oasysRx = {
    right: { coreId: "OASYS_2W", power: "-2.00" },
    left: { coreId: "OASYS_2W", power: "-1.50" },
  };
  const updatedOasysRx = {
    right: { coreId: "OASYS_2W", power: "-2.25" },
    left: { coreId: "OASYS_2W", power: "-1.75" },
  };
  assert.equal(hasLensFamilySelectionChanged(oasysRx, updatedOasysRx), false);
  assert.deepEqual(getLensFamilyQuantityReset(oasysRx, updatedOasysRx), {});

  const asymmetricRx = {
    right: { coreId: "OASYS_2W" },
    left: { coreId: "MOIST" },
  };
  assert.equal(hasLensFamilySelectionChanged(asymmetricRx, asymmetricRx), false);
  assert.equal(
    hasLensFamilySelectionChanged(asymmetricRx, {
      right: { coreId: "OASYS_2W" },
      left: { coreId: "VITA" },
    }),
    true,
  );
});

test("clariti annual 90 to 30 keeps persisted, displayed, and priced quantities aligned", () => {
  const annual90 = buildQuantityConfig("2027-12-31", "CLARITI_1D_90");
  assert.equal(annual90?.defaultPerEye, 4);
  assert.equal(
    getNextSmallerPackSizeOption("CLARITI_1D", "CLARITI_1D_90")?.sku,
    "CLARITI_1D_30",
  );

  const perEye30 = convertPackSizeQuantity(annual90?.defaultPerEye ?? null, "CLARITI_1D_90", "CLARITI_1D_30");
  assert.equal(perEye30, 12);
  assert.equal(
    getQuantityOptionsWithSelectedValue(
      buildQuantityConfig("2027-12-31", "CLARITI_1D_30")?.options ?? [],
      perEye30 ?? 0,
    ).includes(perEye30 ?? 0),
    true,
  );

  const quote = getAuthoritativeOrderQuote({
    sku: "CLARITI_1D_30",
    totalBoxes: 24,
    rightBoxCount: 12,
    leftBoxCount: 12,
  });
  assert.equal(quote.totalMonths, 12);
  assert.equal(quote.shippingCents, 0);
  assert.equal(getCheckoutAmountCents({ id: "clariti", total_amount_cents: quote.totalAmountCents, feedback_credit_cents: 0 }), quote.totalAmountCents);
  assert.equal(getPersistedPackSku("CLARITI_1D", "CLARITI_1D_30", true), "CLARITI_1D_30");
});

test("quantity options retain persisted and adjusted selections outside the normal cap", () => {
  assert.deepEqual(
    getQuantityOptionsWithSelectedValue([0, 1, 2, 3, 4, 5, 6, 7, 8], 54),
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 54],
  );
});

test("preserves a valid selected SKU but locks pack changes after quantity adjustment", () => {
  assert.equal(getPersistedPackSku("OASYS_2W", "OASYS_2W_12", true), "OASYS_2W_12");
  assert.equal(getPersistedPackSku("OASYS_2W", "MOIST_30", true), null);
  assert.equal(canChangeOrderPackSize({ adjusted: true, previousSku: "OASYS_2W_24", requestedSku: "OASYS_2W_12" }), false);
  assert.equal(canChangeOrderPackSize({ adjusted: false, previousSku: "OASYS_2W_24", requestedSku: "OASYS_2W_12" }), true);
});
