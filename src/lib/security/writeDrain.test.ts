import assert from "node:assert/strict";
import {
  WRITE_DRAIN_HEADER_NONCE,
  WRITE_DRAIN_HEADER_SCOPE,
  WRITE_DRAIN_HEADER_SIGNATURE,
  WRITE_DRAIN_HEADER_TIMESTAMP,
  createWriteDrainSignature,
  evaluateWriteDrain,
  stripWriteDrainCanaryHeaders,
  type WriteRouteGroup,
} from "./writeDrain";

const secret = "d".repeat(48);
const nowSeconds = 1_800_000_000;
const nonce = "ab".repeat(16);

function signedRequest(
  url: string,
  scope: WriteRouteGroup,
  method = "POST",
  timestamp = String(nowSeconds),
): Request {
  const pathname = new URL(url).pathname;
  return new Request(url, {
    method,
    headers: {
      [WRITE_DRAIN_HEADER_SCOPE]: scope,
      [WRITE_DRAIN_HEADER_TIMESTAMP]: timestamp,
      [WRITE_DRAIN_HEADER_NONCE]: nonce,
      [WRITE_DRAIN_HEADER_SIGNATURE]: createWriteDrainSignature(
        method,
        pathname,
        scope,
        timestamp,
        nonce,
        secret,
      ),
    },
  });
}

assert.deepEqual(
  evaluateWriteDrain(
    new Request("https://www.honestlenses.com/api/orders", {
      method: "POST",
    }),
    { mode: "all", secret, nowSeconds },
  ),
  {
    allowed: false,
    bypassed: false,
    group: "checkout",
    mode: "all",
    reason: "write-drained",
  },
  "normal customer writes must be blocked during the full drain",
);

assert.equal(
  evaluateWriteDrain(
    new Request("https://www.honestlenses.com/api/orders", {
      method: "GET",
    }),
    { mode: "all", secret, nowSeconds },
  ).allowed,
  true,
  "reads must remain available during the drain",
);

assert.equal(
  evaluateWriteDrain(
    signedRequest("https://www.honestlenses.com/api/checkout/pay", "checkout"),
    { mode: "all", secret, nowSeconds },
  ).bypassed,
  true,
  "a correctly scoped checkout canary must pass",
);

assert.equal(
  evaluateWriteDrain(
    signedRequest(
      "https://www.honestlenses.com/api/admin/orders/123",
      "operations",
      "PATCH",
    ),
    { mode: "all", secret, nowSeconds },
  ).bypassed,
  true,
  "a correctly scoped admin canary must pass",
);

const forged = signedRequest(
  "https://www.honestlenses.com/api/checkout/pay",
  "checkout",
);
forged.headers.set(WRITE_DRAIN_HEADER_SIGNATURE, "forged");
assert.equal(
  evaluateWriteDrain(forged, { mode: "all", secret, nowSeconds }).allowed,
  false,
  "a forged canary signature must fail closed",
);

assert.equal(
  evaluateWriteDrain(
    signedRequest(
      "https://www.honestlenses.com/api/checkout/pay",
      "checkout",
      "POST",
      String(nowSeconds - 61),
    ),
    { mode: "all", secret, nowSeconds },
  ).allowed,
  false,
  "an expired canary signature must fail closed",
);

assert.equal(
  evaluateWriteDrain(
    signedRequest(
      "https://www.honestlenses.com/api/checkout/pay",
      "operations",
    ),
    { mode: "all", secret, nowSeconds },
  ).allowed,
  false,
  "an operations canary must not authorize checkout",
);

const replayedPath = signedRequest(
  "https://www.honestlenses.com/api/checkout/pay",
  "checkout",
);
assert.equal(
  evaluateWriteDrain(
    new Request("https://www.honestlenses.com/api/orders", {
      method: "POST",
      headers: replayedPath.headers,
    }),
    { mode: "all", secret, nowSeconds },
  ).allowed,
  false,
  "a signature copied to a different path must fail",
);

assert.equal(
  evaluateWriteDrain(
    new Request("https://www.honestlenses.com/api/webhooks/stripe", {
      method: "POST",
    }),
    { mode: "webhooks", secret, nowSeconds },
  ).allowed,
  true,
  "the webhook reopen phase must permit webhooks",
);
assert.equal(
  evaluateWriteDrain(
    new Request("https://www.honestlenses.com/api/admin/orders/123", {
      method: "PATCH",
    }),
    { mode: "webhooks", secret, nowSeconds },
  ).allowed,
  false,
  "the webhook reopen phase must still block operations",
);
assert.equal(
  evaluateWriteDrain(
    new Request("https://www.honestlenses.com/api/admin/orders/123", {
      method: "PATCH",
    }),
    { mode: "operations", secret, nowSeconds },
  ).allowed,
  true,
  "the operations reopen phase must permit admin writes",
);
assert.equal(
  evaluateWriteDrain(
    new Request("https://www.honestlenses.com/api/checkout/pay", {
      method: "POST",
    }),
    { mode: "operations", secret, nowSeconds },
  ).allowed,
  false,
  "the operations phase must still block checkout",
);
assert.equal(
  evaluateWriteDrain(
    new Request("https://www.honestlenses.com/api/checkout/pay", {
      method: "POST",
    }),
    { mode: "off", secret, nowSeconds },
  ).allowed,
  true,
  "disabling the drain must restore normal writes",
);
assert.equal(
  evaluateWriteDrain(
    new Request("https://www.honestlenses.com/api/checkout/pay", {
      method: "POST",
    }),
    { mode: "misspelled", secret, nowSeconds },
  ).allowed,
  false,
  "an invalid drain mode must fail closed",
);

const sanitized = stripWriteDrainCanaryHeaders(
  signedRequest(
    "https://www.honestlenses.com/api/checkout/pay",
    "checkout",
  ).headers,
);
assert.equal(sanitized.get(WRITE_DRAIN_HEADER_SIGNATURE), null);
assert.equal(sanitized.get(WRITE_DRAIN_HEADER_TIMESTAMP), null);
assert.equal(sanitized.get(WRITE_DRAIN_HEADER_NONCE), null);
assert.equal(sanitized.get(WRITE_DRAIN_HEADER_SCOPE), null);

assert.notEqual(
  process.env.COMMERCE_V2_ENABLED?.toLowerCase(),
  "true",
  "write-drain tests must never enable Commerce v2",
);

console.log("Production write-drain authorization matrix passed");
