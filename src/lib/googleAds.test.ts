import assert from "node:assert/strict";

import {
  buildGoogleAdsPurchaseConversion,
  hasRecordedGoogleAdsPurchase,
  recordGoogleAdsPurchase,
} from "./googleAds";

const successfulOrder = {
  id: "order-123",
  status: "authorized",
  payment_intent_id: "pi_123",
  total_amount_cents: 34999,
  feedback_credit_cents: 1000,
};

assert.deepEqual(buildGoogleAdsPurchaseConversion(successfulOrder), {
  send_to: "AW-18375463747/7903CKX6sd0cEMOmjbpE",
  value: 339.99,
  currency: "USD",
  transaction_id: "order-123",
});

assert.equal(
  buildGoogleAdsPurchaseConversion({ ...successfulOrder, status: "draft" }),
  null,
  "incomplete orders must not create a conversion",
);
assert.equal(
  buildGoogleAdsPurchaseConversion({ ...successfulOrder, status: "failed" }),
  null,
  "failed orders must not create a conversion",
);
assert.equal(
  buildGoogleAdsPurchaseConversion({ ...successfulOrder, payment_intent_id: null }),
  null,
  "orders without a Stripe payment authorization reference must not convert",
);

const values = new Map<string, string>();
const storage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
};
assert.equal(hasRecordedGoogleAdsPurchase(storage, "order-123"), false);
recordGoogleAdsPurchase(storage, "order-123");
assert.equal(hasRecordedGoogleAdsPurchase(storage, "order-123"), true);

console.log("Google Ads purchase conversion tests passed");
