import assert from "node:assert/strict";
import { getFeedbackAmountDueCents } from "@/lib/abandonmentFeedback";
import { getAuthoritativeOrderQuote } from "@/lib/orders/orderPricing";
import {
  getAuthoritativeOrderQuantity,
  getStoredEyeQuantityPresence,
} from "@/lib/orders/orderQuantity";
import {
  hasResolvedCartQuantity,
  resolveCartEyeBoxCounts,
} from "./resolveQuantities";

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

const unresolvedQuantity = getAuthoritativeOrderQuantity({
  right_box_count: null,
  left_box_count: null,
  total_box_count: null,
  box_count: 0,
});
const unresolvedPresence = getStoredEyeQuantityPresence({
  right_box_count: null,
  left_box_count: null,
  total_box_count: null,
  box_count: 0,
});

assertCounts(
  "new unresolved two-eye draft: synthetic zero does not suppress calculated defaults",
  resolveCartEyeBoxCounts({
    hasRightEye: true,
    hasLeftEye: true,
    defaultPerEye: DEFAULT_PER_EYE,
    storedRightBoxCount: unresolvedQuantity.right,
    storedLeftBoxCount: unresolvedQuantity.left,
    hasStoredRightBoxCount: unresolvedPresence.right,
    hasStoredLeftBoxCount: unresolvedPresence.left,
  }),
  { right: DEFAULT_PER_EYE, left: DEFAULT_PER_EYE, totalBoxes: 8 },
);

const explicitRightZeroQuantity = getAuthoritativeOrderQuantity({
  right_box_count: 0,
  left_box_count: 2,
  total_box_count: 2,
  box_count: 2,
});
const explicitRightZeroPresence = getStoredEyeQuantityPresence({
  right_box_count: 0,
  left_box_count: 2,
  total_box_count: 2,
  box_count: 2,
});

assertCounts(
  "explicit right-eye zero with positive left-eye quantity remains a valid one-eye order",
  resolveCartEyeBoxCounts({
    hasRightEye: true,
    hasLeftEye: true,
    defaultPerEye: DEFAULT_PER_EYE,
    storedRightBoxCount: explicitRightZeroQuantity.right,
    storedLeftBoxCount: explicitRightZeroQuantity.left,
    hasStoredRightBoxCount: explicitRightZeroPresence.right,
    hasStoredLeftBoxCount: explicitRightZeroPresence.left,
  }),
  { right: 0, left: 2, totalBoxes: 2 },
);

const explicitLeftZeroQuantity = getAuthoritativeOrderQuantity({
  right_box_count: 2,
  left_box_count: 0,
  total_box_count: 2,
  box_count: 2,
});
const explicitLeftZeroPresence = getStoredEyeQuantityPresence({
  right_box_count: 2,
  left_box_count: 0,
  total_box_count: 2,
  box_count: 2,
});

assertCounts(
  "explicit left-eye zero with positive right-eye quantity remains a valid one-eye order",
  resolveCartEyeBoxCounts({
    hasRightEye: true,
    hasLeftEye: true,
    defaultPerEye: DEFAULT_PER_EYE,
    storedRightBoxCount: explicitLeftZeroQuantity.right,
    storedLeftBoxCount: explicitLeftZeroQuantity.left,
    hasStoredRightBoxCount: explicitLeftZeroPresence.right,
    hasStoredLeftBoxCount: explicitLeftZeroPresence.left,
  }),
  { right: 2, left: 0, totalBoxes: 2 },
);

const explicitEmptyCounts = resolveCartEyeBoxCounts({
  hasRightEye: true,
  hasLeftEye: true,
  defaultPerEye: DEFAULT_PER_EYE,
  requestedRightBoxCount: 0,
  requestedLeftBoxCount: 0,
  hasRequestedRightBoxCount: true,
  hasRequestedLeftBoxCount: true,
});

assertCounts(
  "explicit both-eye zero resolves only as an empty cart",
  explicitEmptyCounts,
  { right: 0, left: 0, totalBoxes: 0 },
);
assert.equal(
  hasResolvedCartQuantity(explicitEmptyCounts),
  false,
  "an explicit empty cart must be rejected before pricing",
);

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

const adjustedQuantity = getAuthoritativeOrderQuantity({
  right_box_count: 4,
  left_box_count: 4,
  total_box_count: 8,
  box_count: 8,
  adjusted_right_box_count: 1,
  adjusted_left_box_count: 2,
  adjusted_total_box_count: 3,
});
const adjustedPresence = getStoredEyeQuantityPresence({
  right_box_count: 4,
  left_box_count: 4,
  total_box_count: 8,
  box_count: 8,
  adjusted_right_box_count: 1,
  adjusted_left_box_count: 2,
  adjusted_total_box_count: 3,
});

assert.equal(
  adjustedQuantity.adjusted,
  true,
  "valid admin-adjusted quantities remain authoritative",
);
assertCounts(
  "adjusted quantities remain authoritative during cart resolution",
  resolveCartEyeBoxCounts({
    hasRightEye: true,
    hasLeftEye: true,
    defaultPerEye: DEFAULT_PER_EYE,
    storedRightBoxCount: adjustedQuantity.right,
    storedLeftBoxCount: adjustedQuantity.left,
    hasStoredRightBoxCount: adjustedPresence.right,
    hasStoredLeftBoxCount: adjustedPresence.left,
  }),
  { right: 1, left: 2, totalBoxes: 3 },
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

const dailiesTotal1Draft = {
  right_box_count: null,
  left_box_count: null,
  total_box_count: null,
  box_count: 0,
};
const dailiesTotal1Stored = getAuthoritativeOrderQuantity(dailiesTotal1Draft);
const dailiesTotal1Presence =
  getStoredEyeQuantityPresence(dailiesTotal1Draft);
const dailiesTotal1Counts = resolveCartEyeBoxCounts({
  hasRightEye: true,
  hasLeftEye: true,
  defaultPerEye: DEFAULT_PER_EYE,
  storedRightBoxCount: dailiesTotal1Stored.right,
  storedLeftBoxCount: dailiesTotal1Stored.left,
  hasStoredRightBoxCount: dailiesTotal1Presence.right,
  hasStoredLeftBoxCount: dailiesTotal1Presence.left,
});
const dailiesTotal1Quote = getAuthoritativeOrderQuote({
  sku: "DT1_90",
  totalBoxes: dailiesTotal1Counts.totalBoxes,
  rightBoxCount: dailiesTotal1Counts.right,
  leftBoxCount: dailiesTotal1Counts.left,
  shippingMethod: "standard",
});

assert.deepEqual(
  dailiesTotal1Counts,
  { right: 4, left: 4, totalBoxes: 8 },
  "Dailies TOTAL1 manual entry must resolve annual-supply defaults on its first attempt",
);
assert.ok(
  dailiesTotal1Quote.totalAmountCents > 0,
  "Dailies TOTAL1 manual entry must produce a priced cart",
);
assert.equal(
  dailiesTotal1Quote.shippingCents,
  0,
  "Dailies TOTAL1 annual-supply defaults retain free standard shipping",
);

console.log("Cart quantity resolver matrix passed");
