import assert from "node:assert/strict";

import {
  SAVE_CART_EXIT_INTENT_MIN_DWELL_MS,
  shouldShowSaveCartExitIntent,
} from "./saveCartExitIntent";

const eligibleExit = {
  cartHasItems: true,
  checkoutStarted: false,
  elapsedMs: SAVE_CART_EXIT_INTENT_MIN_DWELL_MS,
  promptAlreadySeen: false,
  relatedTargetIsNull: true,
  pointerExitedAboveViewport: true,
};

assert.equal(shouldShowSaveCartExitIntent(eligibleExit), true);
assert.equal(
  shouldShowSaveCartExitIntent({ ...eligibleExit, elapsedMs: 1 }),
  false,
  "the prompt waits for reasonable cart dwell time",
);
assert.equal(
  shouldShowSaveCartExitIntent({ ...eligibleExit, cartHasItems: false }),
  false,
  "an empty cart never triggers the prompt",
);
assert.equal(
  shouldShowSaveCartExitIntent({ ...eligibleExit, checkoutStarted: true }),
  false,
  "checkout intent suppresses the prompt",
);
assert.equal(
  shouldShowSaveCartExitIntent({ ...eligibleExit, promptAlreadySeen: true }),
  false,
  "a shown or dismissed prompt does not repeat in the session",
);
assert.equal(
  shouldShowSaveCartExitIntent({ ...eligibleExit, relatedTargetIsNull: false }),
  false,
  "ordinary in-page pointer movement is not exit intent",
);
assert.equal(
  shouldShowSaveCartExitIntent({ ...eligibleExit, pointerExitedAboveViewport: false }),
  false,
  "leaving through another edge is not treated as desktop exit intent",
);

console.log("Save-cart exit-intent gating checks passed");
