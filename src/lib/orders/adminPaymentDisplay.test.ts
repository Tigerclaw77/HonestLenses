import assert from "node:assert/strict";
import {
  getAdminPaymentDisplay,
  shouldShowPaymentOperationalCard,
} from "./adminPaymentDisplay";

assert.deepEqual(
  getAdminPaymentDisplay({
    payment_intent_id: null,
    stripe_authorized_amount_cents: 13799,
    stripe_captured_amount_cents: 13799,
  }),
  { authorizedAmountCents: null, capturedAmountCents: null },
  "a pricing total without a PaymentIntent must never be presented as payment evidence",
);

assert.equal(
  shouldShowPaymentOperationalCard({
    paymentStatus: "draft",
    stripePaymentIntentStatus: "requires_payment_method",
    hasPaymentAction: false,
  }),
  false,
  "an unactionable draft PaymentIntent does not render a PAYMENT card",
);
assert.equal(
  shouldShowPaymentOperationalCard({
    paymentStatus: "authorized",
    stripePaymentIntentStatus: "requires_capture",
    hasPaymentAction: true,
  }),
  true,
  "an actionable authorization keeps the PAYMENT card",
);
assert.equal(
  shouldShowPaymentOperationalCard({
    paymentStatus: "captured",
    stripePaymentIntentStatus: "succeeded",
    hasPaymentAction: false,
  }),
  true,
  "useful completed payment information keeps the PAYMENT card",
);

assert.deepEqual(
  getAdminPaymentDisplay({
    payment_intent_id: "pi_authorized",
    stripe_payment_intent_status: "requires_capture",
    stripe_authorized_amount_cents: 13799,
  }),
  { authorizedAmountCents: 13799, capturedAmountCents: null },
  "a real Stripe authorization is distinct from a capture",
);

assert.deepEqual(
  getAdminPaymentDisplay({
    payment_intent_id: "pi_captured",
    stripe_payment_intent_status: "succeeded",
    stripe_authorized_amount_cents: 13799,
    stripe_captured_amount_cents: 11999,
  }),
  { authorizedAmountCents: 13799, capturedAmountCents: 11999 },
  "a real capture uses Stripe's received amount rather than the order total",
);

console.log("Admin payment display regression tests passed.");
