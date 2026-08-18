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
import { getAuthoritativeOrderQuote } from "@/lib/orders/orderPricing";
import { checkoutAmountMatchesPaymentIntent, getCheckoutAmountCents } from "@/lib/payments/checkoutAmount";
import { resolveOrderManufacturer } from "@/lib/orders/skuManufacturer";

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

test("preserves a valid selected SKU but locks pack changes after quantity adjustment", () => {
  assert.equal(getPersistedPackSku("OASYS_2W", "OASYS_2W_12", true), "OASYS_2W_12");
  assert.equal(getPersistedPackSku("OASYS_2W", "MOIST_30", true), null);
  assert.equal(canChangeOrderPackSize({ adjusted: true, previousSku: "OASYS_2W_24", requestedSku: "OASYS_2W_12" }), false);
  assert.equal(canChangeOrderPackSize({ adjusted: false, previousSku: "OASYS_2W_24", requestedSku: "OASYS_2W_12" }), true);
});
