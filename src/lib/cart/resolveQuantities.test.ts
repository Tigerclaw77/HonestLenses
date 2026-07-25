import assert from "node:assert/strict";
import { getFeedbackAmountDueCents } from "@/lib/abandonmentFeedback";
import { getAuthoritativeOrderQuote } from "@/lib/orders/orderPricing";
import { resolveCartEyeBoxCounts } from "./resolveQuantities";

const SKU = "OASYS_MAX_1D_90";
const DEFAULT_PER_EYE = 4;

function resolvedTotalAmountCents(totalBoxes: number): number {
  return getAuthoritativeOrderQuote({
    sku: SKU,
    totalBoxes,
    shippingMethod: "standard",
  }).totalAmountCents;
}

function assertCounts(
  label: string,
  actual: ReturnType<typeof resolveCartEyeBoxCounts>,
  expected: ReturnType<typeof resolveCartEyeBoxCounts>,
) {
  assert.deepEqual(actual, expected, label);
}

assertCounts(
  "1 box: one-eye order keeps the customer's edited one-box quantity",
  resolveCartEyeBoxCounts({
    hasRightEye: true,
    hasLeftEye: false,
    defaultPerEye: DEFAULT_PER_EYE,
    storedRightBoxCount: 1,
  }),
  { right: 1, left: null, totalBoxes: 1 },
);

assertCounts(
  "2 boxes: checkout payload without quantities preserves persisted cart edits",
  resolveCartEyeBoxCounts({
    hasRightEye: true,
    hasLeftEye: true,
    defaultPerEye: DEFAULT_PER_EYE,
    storedRightBoxCount: 1,
    storedLeftBoxCount: 1,
  }),
  { right: 1, left: 1, totalBoxes: 2 },
);

assertCounts(
  "4 boxes: stored customer quantity is canonical when no new edit is sent",
  resolveCartEyeBoxCounts({
    hasRightEye: true,
    hasLeftEye: true,
    defaultPerEye: DEFAULT_PER_EYE,
    storedRightBoxCount: 2,
    storedLeftBoxCount: 2,
  }),
  { right: 2, left: 2, totalBoxes: 4 },
);

assertCounts(
  "quantity changes: explicit UI quantities override stored values",
  resolveCartEyeBoxCounts({
    hasRightEye: true,
    hasLeftEye: true,
    defaultPerEye: DEFAULT_PER_EYE,
    storedRightBoxCount: 1,
    storedLeftBoxCount: 1,
    requestedRightBoxCount: 2,
    requestedLeftBoxCount: 2,
    hasRequestedRightBoxCount: true,
    hasRequestedLeftBoxCount: true,
  }),
  { right: 2, left: 2, totalBoxes: 4 },
);

assertCounts(
  "changing pack size/default: stored edited count is not reset to the new default",
  resolveCartEyeBoxCounts({
    hasRightEye: true,
    hasLeftEye: true,
    defaultPerEye: DEFAULT_PER_EYE,
    storedRightBoxCount: 1,
    storedLeftBoxCount: 1,
  }),
  { right: 1, left: 1, totalBoxes: 2 },
);

assertCounts(
  "changing pack size/default: unset orders still receive the calculated default",
  resolveCartEyeBoxCounts({
    hasRightEye: true,
    hasLeftEye: true,
    defaultPerEye: DEFAULT_PER_EYE,
  }),
  { right: DEFAULT_PER_EYE, left: DEFAULT_PER_EYE, totalBoxes: 8 },
);

assertCounts(
  "changing eyes independently: one explicit eye edit preserves the other eye",
  resolveCartEyeBoxCounts({
    hasRightEye: true,
    hasLeftEye: true,
    defaultPerEye: DEFAULT_PER_EYE,
    storedRightBoxCount: 1,
    storedLeftBoxCount: 1,
    requestedRightBoxCount: 3,
    hasRequestedRightBoxCount: true,
  }),
  { right: 3, left: 1, totalBoxes: 4 },
);

assertCounts(
  "cart editing: explicit zero for one eye is honored without resetting the other",
  resolveCartEyeBoxCounts({
    hasRightEye: true,
    hasLeftEye: true,
    defaultPerEye: DEFAULT_PER_EYE,
    storedRightBoxCount: 2,
    storedLeftBoxCount: 1,
    requestedLeftBoxCount: 0,
    hasRequestedLeftBoxCount: true,
  }),
  { right: 2, left: 0, totalBoxes: 2 },
);

const checkoutPayloadCounts = resolveCartEyeBoxCounts({
  hasRightEye: true,
  hasLeftEye: true,
  defaultPerEye: DEFAULT_PER_EYE,
  storedRightBoxCount: 1,
  storedLeftBoxCount: 1,
});

const reviewedTotalCents = resolvedTotalAmountCents(
  checkoutPayloadCounts.totalBoxes,
);
const staleDefaultTotalCents = resolvedTotalAmountCents(
  DEFAULT_PER_EYE + DEFAULT_PER_EYE,
);

assert.equal(
  checkoutPayloadCounts.totalBoxes,
  2,
  "checkout payload without quantity fields must use stored two-box cart quantity",
);
assert.notEqual(
  reviewedTotalCents,
  staleDefaultTotalCents,
  "server totals must not be calculated from the stale default quantity",
);
assert.equal(
  getFeedbackAmountDueCents({
    total_amount_cents: reviewedTotalCents,
    feedback_credit_cents: 0,
  }),
  reviewedTotalCents,
  "Stripe amount due must come from the reviewed server total",
);

const persistedOrderUpdate = {
  right_box_count: checkoutPayloadCounts.right,
  left_box_count: checkoutPayloadCounts.left,
  box_count: checkoutPayloadCounts.totalBoxes,
  total_box_count: checkoutPayloadCounts.totalBoxes,
};

assert.deepEqual(
  persistedOrderUpdate,
  {
    right_box_count: 1,
    left_box_count: 1,
    box_count: 2,
    total_box_count: 2,
  },
  "persisted order quantities must remain the customer's edited quantities",
);

console.log("Cart quantity resolver matrix passed");
