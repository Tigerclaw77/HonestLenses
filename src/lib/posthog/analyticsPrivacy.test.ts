import assert from "node:assert/strict";

import {
  sanitizeAnalyticsPath,
  sanitizeAnalyticsProperties,
} from "./events";

assert.deepEqual(
  sanitizeAnalyticsProperties({
    order_id: "order-123",
    transaction_id: "transaction-123",
    payment_intent_id: "pi_123",
    query: "free text",
    lens_name: "ACUVUE OASYS",
    total_cart_value_cents: 25_000,
  }),
  {
    order_id: "[redacted]",
    transaction_id: "[redacted]",
    payment_intent_id: "[redacted]",
    query: "[redacted]",
    lens_name: "ACUVUE OASYS",
    total_cart_value_cents: 25_000,
  },
);

assert.equal(
  sanitizeAnalyticsPath("/order/8f7c6b/receipt"),
  "/order/[redacted]/receipt",
);
assert.equal(
  sanitizeAnalyticsPath("/api/admin/orders/8f7c6b"),
  "/api/admin/orders/[redacted]",
);
assert.equal(sanitizeAnalyticsPath("/contacts/acuvue-oasys"), "/contacts/acuvue-oasys");

console.log("Analytics privacy tests passed");
