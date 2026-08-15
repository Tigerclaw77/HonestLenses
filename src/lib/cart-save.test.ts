import assert from "node:assert/strict";

import { isSaveableCart } from "./cart-save";
import {
  CART_SAVE_TOKEN_TTL_DAYS,
  getCartSaveExpiry,
} from "./order-recovery";

assert.equal(
  isSaveableCart({
    id: "order-1",
    status: "draft",
    rx: { expires: "2027-01-01", right: { coreId: "OASYS_1D" } },
    sku: "OASYS_1D_90",
    payment_intent_id: null,
  }),
  true,
);
assert.equal(
  isSaveableCart({
    id: "order-2",
    status: "draft",
    rx: null,
    sku: null,
    payment_intent_id: null,
  }),
  false,
);
assert.equal(
  isSaveableCart({
    id: "order-3",
    status: "draft",
    rx: { expires: "2027-01-01", right: { coreId: "OASYS_1D" } },
    sku: "OASYS_1D_90",
    payment_intent_id: "pi_existing",
  }),
  false,
);

const expiry = new Date(getCartSaveExpiry()).getTime();
const expected = Date.now() + CART_SAVE_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
assert.ok(Math.abs(expiry - expected) < 5_000, "cart-save expiry is seven days");

console.log("Cart save eligibility and expiry checks passed");
