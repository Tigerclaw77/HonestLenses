import assert from "node:assert/strict";
import {
  buildCustomerOrderEmail,
  buildCustomerReceiptHtml,
  getCustomerOrderQuantities,
  getCustomerPaymentStatus,
  isCustomerOrderId,
  type CustomerOrder,
} from "./customerOrder";

const ORDER_ID = "6b4f7274-4fe2-403b-a95a-342148e294be";

const order: CustomerOrder = {
  id: ORDER_ID,
  status: "captured",
  created_at: "2026-07-20T12:00:00.000Z",
  sku: "OASYS_2W_AST_6",
  right_box_count: 4,
  left_box_count: 4,
  total_box_count: 8,
  box_count: 8,
  adjusted_right_box_count: 1,
  adjusted_left_box_count: 1,
  adjusted_total_box_count: 2,
  total_amount_cents: 12198,
  feedback_credit_cents: 0,
  capture_amount_cents: 12198,
  shipping_cents: 999,
  currency: "USD",
  verification_status: "verified",
  fulfillment_status: "ordered",
  shipping_first_name: "Guest",
  shipping_last_name: "Customer",
  vision_insurance_carrier: "vsp",
};

assert.equal(isCustomerOrderId(ORDER_ID), true);
assert.equal(isCustomerOrderId("123"), false);

assert.deepEqual(getCustomerOrderQuantities(order), {
  right: 1,
  left: 1,
  total: 2,
  adjusted: true,
});
assert.equal(getCustomerPaymentStatus(order), "Paid");

const confirmation = buildCustomerOrderEmail({
  orderId: ORDER_ID,
  isUploaded: false,
  siteUrl: "https://www.honestlenses.com/",
});

assert.equal(
  confirmation.orderUrl,
  `https://www.honestlenses.com/order/${ORDER_ID}`,
);
assert.match(confirmation.html, /View Your Order/);
assert.match(confirmation.html, new RegExp(`/order/${ORDER_ID}`));
assert.match(confirmation.text, new RegExp(`/order/${ORDER_ID}`));

const automatedUploadConfirmation = buildCustomerOrderEmail({
  orderId: ORDER_ID,
  isUploaded: true,
  uploadedVerificationComplete: true,
});
assert.match(
  automatedUploadConfirmation.text,
  /uploaded prescription was verified and your payment was completed/i,
);
assert.doesNotMatch(automatedUploadConfirmation.text, /awaiting required review/i);

const receipt = buildCustomerReceiptHtml({
  ...order,
  sku: "<script>alert('no')</script>",
});
assert.doesNotMatch(receipt, /<script>/);
assert.match(receipt, /&lt;script&gt;/);
assert.match(receipt, /Right eye: 1 box/);
assert.match(receipt, /Left eye: 1 box/);
assert.match(receipt, /Total paid\/captured: \$121\.98/);
assert.match(receipt, /HCPCS S0500/);
assert.match(receipt, /Vision plan selected by customer:<\/strong> VSP/);

console.log("Guest order access matrix passed");
