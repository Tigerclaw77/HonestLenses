import { strict as assert } from "node:assert";

import { getPaymentReconciliationDecision } from "./adminPaymentReconciliation";

assert.deepEqual(
  getPaymentReconciliationDecision({ status: "authorized" }, "succeeded"),
  { targetStatus: "captured", changed: true },
  "Stripe succeeded repairs a stale local authorized status",
);

assert.deepEqual(
  getPaymentReconciliationDecision({ status: "captured" }, "succeeded"),
  { targetStatus: "captured", changed: false },
  "an already captured payment is idempotent",
);

assert.deepEqual(
  getPaymentReconciliationDecision({ status: "authorized" }, "requires_capture"),
  { targetStatus: "authorized", changed: false },
  "an already authorized payment is idempotent",
);

assert.deepEqual(
  getPaymentReconciliationDecision({ status: "captured" }, "requires_action"),
  { targetStatus: null, changed: false },
  "ambiguous Stripe states do not invent a local transition",
);

console.log("Admin payment reconciliation matrix passed.");
