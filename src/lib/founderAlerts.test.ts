import { strict as assert } from "node:assert";
import {
  founderAlertKey,
  getFounderAlertRecipient,
} from "./founderAlertConfig";

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

console.log("Founder operational alert recipient and idempotency tests passed.");
