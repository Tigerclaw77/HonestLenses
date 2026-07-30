import { strict as assert } from "node:assert";
import { getAdminExceptionBadges } from "./adminPresentation";

assert.deepEqual(
  getAdminExceptionBadges({
    status: "captured",
    stripe_payment_intent_status: "succeeded",
    verification_status: "verified",
    fulfillment_status: "review",
    shipping_method: "standard",
  }),
  [],
  "routine captured, verified, review states do not create badges",
);
assert.deepEqual(
  getAdminExceptionBadges({
    status: "failed",
    verification_status: "blocked",
    email_delivery_status: "bounced",
    email_delivery_requires_attention: true,
  }),
  [],
  "payment, email, and verification state remain text workflow signals, not badges",
);

const labels = getAdminExceptionBadges({
  status: "captured",
  stripe_payment_intent_status: "succeeded",
  verification_status: "requires_review",
  fulfillment_status: "hold",
  shipping_method: "express",
  adjusted_right_box_count: 2,
  adjusted_left_box_count: 2,
  adjusted_total_box_count: 4,
  admin_notes:
    "Return/refund started. Supplier exception: substitution needs approval.",
}).map((badge) => badge.label);

assert.deepEqual(labels, [
  "EXPRESS",
  "MANUAL REVIEW",
  "HOLD",
  "QUANTITY ADJUSTED",
  "REFUND PENDING",
  "SUPPLIER EXCEPTION",
]);

console.log("Admin dashboard exception-badge regression tests passed.");
