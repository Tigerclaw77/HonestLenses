import { strict as assert } from "node:assert";
import {
  founderAlertKey,
  getFounderAlertRecipient,
  shouldSendUploadedRxFounderAlert,
} from "./founderAlertConfig";

assert.equal(
  getFounderAlertRecipient({
    ARMORY_OPERATOR_ALERT_RECIPIENT: "operator@example.com",
    ADMIN_ALERT_EMAIL: "support@honestlenses.com",
  }),
  "operator@example.com",
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

const uploadKey = founderAlertKey({
  orderId: "09459d83-dc86-441c-b3d7-9de2875acfd0",
  type: "rx_uploaded_review",
  dedupeSuffix: "rx/09459d83-dc86-441c-b3d7-9de2875acfd0/upload-1.png",
});
assert.equal(uploadKey, founderAlertKey({
  orderId: "09459d83-dc86-441c-b3d7-9de2875acfd0",
  type: "rx_uploaded_review",
  dedupeSuffix: "rx/09459d83-dc86-441c-b3d7-9de2875acfd0/upload-1.png",
}), "an upload retry has a stable provider idempotency key");

assert.equal(
  shouldSendUploadedRxFounderAlert({
    status: "draft",
    payment_intent_id: null,
  }),
  false,
  "a prescription uploaded while building a draft cart is not founder work",
);

assert.equal(
  shouldSendUploadedRxFounderAlert({
    status: "pending",
    payment_intent_id: "pi_incomplete",
  }),
  false,
  "an incomplete checkout is not founder work",
);

assert.equal(
  shouldSendUploadedRxFounderAlert({
    status: "authorized",
    payment_intent_id: null,
  }),
  false,
  "an inconsistent authorized row without a payment intent fails closed",
);

assert.equal(
  shouldSendUploadedRxFounderAlert({
    status: "authorized",
    payment_intent_id: "pi_authorized",
  }),
  true,
  "a new prescription on an already-authorized order requires founder review",
);

console.log("Founder operational alert recipient and idempotency tests passed.");
