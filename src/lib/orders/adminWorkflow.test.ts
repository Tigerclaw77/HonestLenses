import { strict as assert } from "node:assert";
import {
  ADMIN_FULFILLMENT_STATUSES,
  assessAdminFulfillmentTransition,
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
    !["ready_to_order", "ordered", "shipped", "completed"].includes(target),
    `uncaptured payment cannot enter ${target}`,
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
  false,
  "uncaptured payment cannot be marked fulfilled",
);

const uploadedReview = assessAdminFulfillmentTransition(
  {
    ...riskyOrder,
    rx_upload_path: "rx/order/prescription.jpg",
    rx_status: "uploaded_pending_review",
  },
  "ready_to_order",
);

const missingIntent = assessAdminFulfillmentTransition(
  {
    status: "captured",
    payment_intent_id: null,
    verification_status: "verified",
    fulfillment_status: "review",
  },
  "ready_to_order",
);
assert.equal(
  missingIntent.allowed,
  false,
  "a local captured label without a PaymentIntent cannot establish payment",
);
assert.ok(
  missingIntent.warnings.some((warning) => warning.includes("PaymentIntent is missing")),
  "the operator receives an explicit missing-payment-evidence reason",
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

console.log("Admin workflow override matrix passed.");
