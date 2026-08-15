import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CART_RECENCY_WINDOW_MS,
  isActiveCartOrder,
  isCartOrderRecent,
} from "./lifecycle";

assert.equal(
  isActiveCartOrder({ status: "draft", paymentIntentId: null }),
  true,
  "a cart is active before checkout starts",
);
assert.equal(
  isActiveCartOrder({ status: "draft", paymentIntentId: "pi_initialized" }),
  true,
  "creating a PaymentIntent must not consume an unpaid draft cart",
);
for (const status of ["authorized", "captured", "pending", "cancelled"]) {
  assert.equal(
    isActiveCartOrder({ status, paymentIntentId: "pi_completed" }),
    false,
    `${status} orders must not be resurrected as carts`,
  );
}

const nowMs = Date.parse("2026-08-15T12:00:00.000Z");
assert.equal(
  isCartOrderRecent({
    createdAt: new Date(nowMs - CART_RECENCY_WINDOW_MS - 1).toISOString(),
    updatedAt: new Date(nowMs - 1_000).toISOString(),
    nowMs,
  }),
  true,
  "signed-in cart recency follows the latest cart update",
);
assert.equal(
  isCartOrderRecent({
    createdAt: new Date(nowMs - CART_RECENCY_WINDOW_MS - 1).toISOString(),
    nowMs,
  }),
  false,
  "stale signed-in drafts remain outside the active cart window",
);
assert.equal(
  isCartOrderRecent({
    createdAt: new Date(nowMs - CART_RECENCY_WINDOW_MS - 1).toISOString(),
    nowMs,
    scopedGuestOrder: true,
  }),
  true,
  "the signed guest order remains addressable for the cookie lifetime",
);

const workspaceRoot = process.cwd();
const cartRoute = readFileSync(
  join(workspaceRoot, "src", "app", "api", "cart", "route.ts"),
  "utf8",
);
const orderRoute = readFileSync(
  join(workspaceRoot, "src", "app", "api", "orders", "route.ts"),
  "utf8",
);
const checkoutPayRoute = readFileSync(
  join(workspaceRoot, "src", "app", "api", "checkout", "pay", "route.ts"),
  "utf8",
);
const checkoutAuthorizedRoute = readFileSync(
  join(
    workspaceRoot,
    "src",
    "app",
    "api",
    "checkout",
    "authorized",
    "route.ts",
  ),
  "utf8",
);

for (const [label, source] of [
  ["cart lookup", cartRoute],
  ["draft reuse", orderRoute],
] as const) {
  assert.doesNotMatch(
    source,
    /\.is\(["']payment_intent_id["'],\s*null\)/,
    `${label} must not hide or replace an unpaid cart after checkout initialization`,
  );
}
assert.match(
  checkoutPayRoute,
  /payment_intent_id:\s*intent\.id/,
  "checkout initialization records the PaymentIntent on the draft",
);
assert.match(
  checkoutPayRoute,
  /keep status draft[\s\S]*?checkout\/authorized confirms Stripe reached requires_capture/,
  "PaymentIntent creation must remain distinct from successful payment authorization",
);
assert.match(
  checkoutAuthorizedRoute,
  /status:\s*uploadedAutoVerified \? "captured" : "authorized"/,
  "only successful authorization advances the order out of cart status",
);

console.log("Cart checkout lifecycle regression checks passed");
