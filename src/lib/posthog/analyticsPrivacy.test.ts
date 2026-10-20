import assert from "node:assert/strict";

import {
  sanitizeAnalyticsPath,
  sanitizeAnalyticsProperties,
  errorToAnalyticsProperties,
  sanitizePostHogEventProperties,
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

assert.deepEqual(errorToAnalyticsProperties(new Error("patient@example.com has a prescription")), {
  error_name: "Error",
  error_message: "[redacted]",
});
assert.equal(sanitizeAnalyticsPath("/receipt/secret-token"), "/receipt/[redacted]");
assert.equal(sanitizeAnalyticsPath("/reorder/secret-token"), "/reorder/[redacted]");
assert.equal(sanitizeAnalyticsPath("/g/session/secret-token"), "/g/session/[redacted]");

assert.deepEqual(
  sanitizePostHogEventProperties(
    {
      $initial_current_url: "https://honestlenses.com/receipt/secret-token?email=patient@example.com",
      $referrer: "https://example.com/?patient=secret",
      order_id: "secret-order",
      lens_name: "Acuvue Oasys",
    },
    "https://honestlenses.com",
    "/receipt/secret-token",
  ),
  {
    order_id: "[redacted]",
    lens_name: "Acuvue Oasys",
    $current_url: "https://honestlenses.com/receipt/[redacted]",
    $pathname: "/receipt/[redacted]",
  },
);

console.log("Analytics privacy tests passed");
