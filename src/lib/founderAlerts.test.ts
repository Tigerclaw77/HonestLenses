import { strict as assert } from "node:assert";
import {
  founderAlertKey,
  getFounderAlertRecipient,
} from "./founderAlertConfig";
import { getFounderVerificationAttention } from "./orders/founderVerificationAttention";

assert.equal(
  getFounderAlertRecipient({
    ARMORY_OPERATOR_ALERT_RECIPIENT: "pauldriggers@aol.com",
    ADMIN_ALERT_EMAIL: "support@honestlenses.com",
  }),
  "pauldriggers@aol.com",
  "founder alerts use the dedicated operator recipient, never support",
);

assert.equal(
  getFounderAlertRecipient({
    FOUNDER_ALERT_EMAIL: "founder@example.com",
    ARMORY_OPERATOR_ALERT_RECIPIENT: "operator@example.com",
  }),
  "founder@example.com",
  "an explicit founder recipient overrides the Armory fallback",
);

assert.throws(
  () => getFounderAlertRecipient({ ADMIN_ALERT_EMAIL: "support@honestlenses.com" }),
  /not configured/,
  "support must not become a founder-alert fallback",
);

const readyToPlaceKey = founderAlertKey({
  orderId: "09459d83-dc86-441c-b3d7-9de2875acfd0",
  type: "ready_to_place",
  dedupeSuffix: "verification-v1",
});
assert.equal(readyToPlaceKey, founderAlertKey({
  orderId: "09459d83-dc86-441c-b3d7-9de2875acfd0",
  type: "ready_to_place",
  dedupeSuffix: "verification-v1",
}), "a ready-to-place retry has a stable provider idempotency key");

const pendingVerification = getFounderVerificationAttention({
  orderId: "09459d83-dc86-441c-b3d7-9de2875acfd0",
  paymentStatus: "authorized",
  verificationStatus: "pending",
  shippingMethod: "express",
  customerName: "Ada Lovelace",
  customerEmail: "ada@example.com",
});
assert.ok(
  pendingVerification,
  "a completed payment authorization with incomplete verification alerts the founder",
);
assert.match(pendingVerification.headline, /SHIPPING: EXPRESS/);
assert.match(pendingVerification.detail, /Customer: Ada Lovelace · ada@example\.com/);
assert.equal(
  founderAlertKey({
    orderId: "09459d83-dc86-441c-b3d7-9de2875acfd0",
    type: pendingVerification.type,
    dedupeSuffix: pendingVerification.dedupeSuffix,
  }),
  founderAlertKey({
    orderId: "09459d83-dc86-441c-b3d7-9de2875acfd0",
    type: pendingVerification.type,
    dedupeSuffix: pendingVerification.dedupeSuffix,
  }),
  "a webhook replay produces the same founder alert idempotency key",
);

console.log("Founder operational alert recipient and idempotency tests passed.");
