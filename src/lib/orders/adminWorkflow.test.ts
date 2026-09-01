import { strict as assert } from "node:assert";
import {
  ADMIN_FULFILLMENT_STATUSES,
  assessAdminFulfillmentTransition,
  isFounderOverrideEligible,
} from "./adminWorkflow";

const riskyOrder = {
  status: "authorized",
  payment_intent_id: "pi_admin_override",
  stripe_payment_intent_status: "requires_capture",
  verification_status: "pending",
  fulfillment_status: "review",
};

for (const target of ADMIN_FULFILLMENT_STATUSES) {
  const transition = assessAdminFulfillmentTransition(riskyOrder, target);
  assert.equal(transition.valid, true, `${target} is a known target`);
  assert.equal(
    transition.allowed,
    true,
    `admin override to ${target} must never be hard-blocked`,
  );
}

const completion = assessAdminFulfillmentTransition(
  riskyOrder,
  "completed",
);
assert.ok(
  completion.warnings.some((warning) => warning.includes("not captured")),
  "risky completion warns about uncaptured payment",
);
assert.ok(
  completion.warnings.some((warning) =>
    warning.includes("verification is pending"),
  ),
  "risky completion warns about pending verification",
);
assert.equal(
  completion.allowed,
  true,
  "warnings do not change admin completion authority",
);

const uploadedReview = assessAdminFulfillmentTransition(
  {
    ...riskyOrder,
    rx_upload_path: "rx/order/prescription.jpg",
    rx_status: "uploaded_pending_review",
  },
  "ready_to_order",
);
assert.equal(
  uploadedReview.allowed,
  false,
  "an uploaded prescription cannot bypass verification via fulfillment",
);
assert.ok(
  uploadedReview.warnings.some((warning) =>
    warning.includes("Verify prescription"),
  ),
  "the hard gate directs the founder to the verify-and-capture action",
);

const invalid = assessAdminFulfillmentTransition(
  riskyOrder,
  "not_a_real_state",
);
assert.equal(invalid.valid, false, "unknown state is invalid");
assert.equal(invalid.allowed, false, "unknown state is not persisted");

const regression = assessAdminFulfillmentTransition(
  {
    ...riskyOrder,
    status: "captured",
    stripe_payment_intent_status: "succeeded",
    verification_status: "verified",
    fulfillment_status: "shipped",
  },
  "review",
);
assert.equal(regression.allowed, true, "admin can deliberately move backward");
assert.ok(
  regression.warnings.some((warning) => warning.includes("backward")),
  "backward transition has an explicit warning",
);

assert.equal(
  isFounderOverrideEligible({
    ...riskyOrder,
    verification_status: "requires_review",
    rx_status: "ocr_failed",
    rx: { right: { sphere: "-1.00" }, left: { sphere: "-1.25" } },
  }),
  true,
  "founder override remains available when OCR/product matching requires review",
);
assert.equal(
  isFounderOverrideEligible({
    ...riskyOrder,
    verification_status: "pending",
    rx_source: "doctor",
    prescriber_name: "Dr. Safeguard",
  }),
  true,
  "an authorized order with reviewable Rx evidence can be explicitly overridden",
);
assert.equal(
  isFounderOverrideEligible({
    ...riskyOrder,
    status: "draft",
    payment_intent_id: null,
    verification_status: "pending",
    rx: null,
  }),
  false,
  "ordinary unpaid customer paths cannot use founder override",
);
assert.equal(
  isFounderOverrideEligible({
    ...riskyOrder,
    verification_status: "verified",
    rx: { right: { sphere: "-1.00" } },
  }),
  false,
  "already verified orders do not expose founder override",
);

console.log("Admin workflow override matrix passed.");
