import { strict as assert } from "node:assert";

import { reconcileCachedOrderDetails } from "./orderMutationReconciliation";
import { classifyOperationalQueue } from "../orders/operationalQueue";

const staleDetail = {
  id: "order-sofia-regression",
  status: "authorized",
  verification_status: "information_needed",
  fulfillment_status: "review",
  stripe_payment_intent_status: "requires_capture",
  rx_ocr_raw: { text: "detail-only OCR payload" },
};

const authoritativeQueueOrder = {
  id: staleDetail.id,
  status: "captured",
  verification_status: "verified",
  verification_passed: true,
  fulfillment_status: "ready_to_order",
  payment_intent_id: "pi_fixture",
  stripe_payment_intent_status: "succeeded",
  rx: { right: { sphere: "-2.25" }, left: { sphere: "-2.25" } },
  operational_queue: {
    bucket: "ready_to_order" as const,
    reasons: ["Payment is captured and prescription verification is complete."],
    riskLevel: "normal" as const,
    paymentStatus: "captured" as const,
    verificationStatus: "verified" as const,
    fulfillmentStatus: "ready_to_order",
  },
};

const reconciled = reconcileCachedOrderDetails<
  { id: string; [key: string]: unknown }
>(
  { [staleDetail.id]: staleDetail },
  [authoritativeQueueOrder],
)[staleDetail.id];

assert.equal(reconciled.verification_status, "verified");
assert.equal(reconciled.status, "captured");
assert.equal(reconciled.stripe_payment_intent_status, "succeeded");
assert.equal(reconciled.fulfillment_status, "ready_to_order");
assert.deepEqual(
  reconciled.rx_ocr_raw,
  staleDetail.rx_ocr_raw,
  "queue reconciliation preserves detail-only fields",
);
assert.equal(
  classifyOperationalQueue(authoritativeQueueOrder).bucket,
  "ready_to_order",
  "queue membership follows the authoritative projection",
);

console.log("Admin mutation reconciliation regression tests passed.");
