import assert from "node:assert/strict";
import {
  buildCustomerReceiptHtml,
  getCustomerAmountCents,
  getCustomerOrderQuantities,
  type CustomerOrder,
} from "./customerOrder";
import { projectOrderCommerce } from "./orderCommerce";
import { getAuthoritativeOrderQuote } from "./orderPricing";
import {
  checkoutAmountMatchesPaymentIntent,
  getCheckoutAmountCents,
} from "@/lib/payments/checkoutAmount";
import { getCaptureAmountCents } from "@/lib/payments/captureAmount";
import { getPaymentIntentAmountAction } from "@/lib/payments/paymentIntentAmount";

const SKU = "OASYS_MAX_1D_90";
const originalAnnualQuote = getAuthoritativeOrderQuote({
  sku: SKU,
  totalBoxes: 8,
  rightBoxCount: 4,
  leftBoxCount: 4,
  shippingMethod: "standard",
});
const adjustedQuote = getAuthoritativeOrderQuote({
  sku: SKU,
  totalBoxes: 2,
  rightBoxCount: 1,
  leftBoxCount: 1,
  shippingMethod: "standard",
});

assert.equal(originalAnnualQuote.totalMonths, 12);
assert.equal(
  originalAnnualQuote.shippingCents,
  0,
  "annual supply must retain free standard shipping",
);
assert.equal(adjustedQuote.totalMonths, 3);
assert.ok(
  adjustedQuote.shippingCents > 0,
  "non-annual adjusted quantity must not inherit annual free shipping",
);
assert.notEqual(
  adjustedQuote.totalAmountCents,
  originalAnnualQuote.totalAmountCents,
  "adjusted quantity must produce a new authoritative price",
);

const feedbackCreditCents = 1000;
const amountDueCents = getCheckoutAmountCents({
  total_amount_cents: adjustedQuote.totalAmountCents,
  feedback_credit_cents: feedbackCreditCents,
});
const order: CustomerOrder = {
  id: "6b4f7274-4fe2-403b-a95a-342148e294be",
  status: "authorized",
  created_at: "2026-07-24T12:00:00.000Z",
  sku: SKU,
  right_box_count: 4,
  left_box_count: 4,
  total_box_count: 8,
  box_count: 8,
  adjusted_right_box_count: 1,
  adjusted_left_box_count: 1,
  adjusted_total_box_count: 2,
  total_amount_cents: adjustedQuote.totalAmountCents,
  feedback_credit_cents: feedbackCreditCents,
  capture_amount_cents: amountDueCents,
  shipping_cents: 0,
  currency: "USD",
  verification_status: "verified",
  fulfillment_status: "ready_to_order",
  shipping_first_name: "Integrity",
  shipping_last_name: "Test",
  vision_insurance_carrier: null,
};

const commerce = projectOrderCommerce(order);
assert.deepEqual(commerce.quantity, {
  right: 1,
  left: 1,
  total: 2,
  adjusted: true,
});
assert.equal(
  commerce.billingAmountCents,
  amountDueCents,
  "shared customer/queue/Armory commerce projection must use adjusted billing",
);
assert.deepEqual(getCustomerOrderQuantities(order), commerce.quantity);
assert.equal(getCustomerAmountCents(order), amountDueCents);
assert.equal(getCaptureAmountCents(order), amountDueCents);

const receipt = buildCustomerReceiptHtml(order);
assert.match(receipt, /Right eye: 1 box/);
assert.match(receipt, /Left eye: 1 box/);
assert.match(
  receipt,
  new RegExp(`Total paid/captured: \\$${(amountDueCents / 100).toFixed(2)}`),
  "receipt must show the adjusted billing amount",
);

assert.equal(
  checkoutAmountMatchesPaymentIntent(order, amountDueCents),
  true,
  "displayed checkout amount must match the Stripe authorization amount",
);
assert.equal(
  checkoutAmountMatchesPaymentIntent(
    order,
    originalAnnualQuote.totalAmountCents,
  ),
  false,
  "a stale annual authorization must fail the checkout integrity guard",
);
assert.deepEqual(
  getPaymentIntentAmountAction(
    { amount: originalAnnualQuote.totalAmountCents, status: "requires_capture" },
    amountDueCents,
  ),
  { action: "cancel_and_replace" },
  "a stale authorization must be replaced rather than partially captured",
);
assert.deepEqual(
  getPaymentIntentAmountAction(
    { amount: amountDueCents, status: "requires_capture" },
    amountDueCents,
  ),
  { action: "keep" },
);
assert.deepEqual(
  getPaymentIntentAmountAction(
    { amount: originalAnnualQuote.totalAmountCents, status: "succeeded" },
    amountDueCents,
  ),
  { action: "reject_captured" },
  "captured orders must reject quantity mutation instead of rewriting history",
);

console.log("Critical production integrity matrix passed");
