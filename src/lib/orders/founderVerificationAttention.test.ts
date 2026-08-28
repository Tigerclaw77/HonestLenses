import assert from "node:assert/strict";

import { founderAlertKey } from "@/lib/founderAlertConfig";
import { getFounderVerificationAttention } from "./founderVerificationAttention";

const attention = getFounderVerificationAttention({
  orderId: "09459d83-dc86-441c-b3d7-9de2875acfd0",
  paymentStatus: "authorized",
  verificationStatus: "pending",
  shippingMethod: "express",
  customerName: "Ada Lovelace",
  customerEmail: "ada@example.com",
});

assert.ok(attention, "an authorized order with incomplete verification alerts the founder");
assert.match(attention.headline, /SHIPPING: EXPRESS/);
assert.match(attention.detail, /SHIPPING: EXPRESS/);
assert.equal(
  founderAlertKey({
    orderId: "09459d83-dc86-441c-b3d7-9de2875acfd0",
    type: attention.type,
    dedupeSuffix: attention.dedupeSuffix,
  }),
  founderAlertKey({
    orderId: "09459d83-dc86-441c-b3d7-9de2875acfd0",
    type: attention.type,
    dedupeSuffix: attention.dedupeSuffix,
  }),
  "webhook retry produces the same alert dedupe key",
);

assert.equal(
  getFounderVerificationAttention({
    orderId: "09459d83-dc86-441c-b3d7-9de2875acfd0",
    paymentStatus: "captured",
    verificationStatus: "verified",
    shippingMethod: "standard",
  }),
  null,
  "completed verification does not alert",
);

console.log("Founder verification-pending alert regression tests passed.");
