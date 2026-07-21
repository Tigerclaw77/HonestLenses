import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { Webhook } from "svix";

import {
  normalizeResendDeliveryEvent,
  processResendDeliveryEvent,
  verifyResendWebhook,
} from "./emailDelivery";

const orderId = "fda32216-33c6-4479-8218-d4c69a98862d";

function event(
  type: string,
  extraData: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    type,
    created_at: "2026-07-21T18:00:00.000Z",
    data: {
      email_id: "email-test-1",
      created_at: "2026-07-21T17:59:59.000Z",
      from: "Honest Lenses <orders@honestlenses.com>",
      to: ["customer@example.com"],
      subject: "Order confirmation",
      tags: { order_id: orderId, email_type: "order_confirmation" },
      ...extraData,
    },
  };
}

const delivered = normalizeResendDeliveryEvent(
  event("email.delivered"),
  "svix-delivered",
);
assert.equal(delivered?.deliveryStatus, "delivered");
assert.equal(delivered?.requiresAttention, false);
assert.equal(delivered?.orderId, orderId);

const bounced = normalizeResendDeliveryEvent(
  event("email.bounced", {
    bounce: {
      type: "Permanent",
      subType: "MessageRejected",
      message: "Mailbox does not exist",
    },
  }),
  "svix-bounced",
);
assert.equal(bounced?.deliveryStatus, "bounced");
assert.equal(bounced?.requiresAttention, true);
assert.match(bounced?.failureReason ?? "", /mailbox does not exist/i);

const complained = normalizeResendDeliveryEvent(
  event("email.complained"),
  "svix-complained",
);
assert.equal(complained?.deliveryStatus, "complained");
assert.equal(complained?.requiresAttention, true);

const delayed = normalizeResendDeliveryEvent(
  event("email.delivery_delayed"),
  "svix-delayed",
);
assert.equal(delayed?.deliveryStatus, "delivery_delayed");
assert.equal(delayed?.requiresAttention, false);

assert.equal(
  normalizeResendDeliveryEvent(event("email.opened"), "svix-opened"),
  null,
  "unknown or non-operational events are ignored",
);

const signingSecret = `whsec_${randomBytes(32).toString("base64")}`;
const payload = JSON.stringify(event("email.delivered"));
const webhookId = "msg_test_signature";
const timestamp = new Date();
const signature = new Webhook(signingSecret).sign(
  webhookId,
  timestamp,
  payload,
);

assert.equal(
  verifyResendWebhook(
    payload,
    {
      id: webhookId,
      timestamp: String(Math.floor(timestamp.getTime() / 1000)),
      signature,
    },
    signingSecret,
  ).type,
  "email.delivered",
  "valid Resend signatures are accepted",
);

assert.throws(
  () =>
    verifyResendWebhook(
      payload,
      {
        id: webhookId,
        timestamp: String(Math.floor(timestamp.getTime() / 1000)),
        signature: "v1,invalid",
      },
      signingSecret,
    ),
  "invalid signatures are rejected",
);

async function runAsyncTests() {
const processed = new Set<string>();
const applyOnce = async (normalized: { svixId: string }) => {
  if (processed.has(normalized.svixId)) {
    return { duplicate: true, matched: false };
  }
  processed.add(normalized.svixId);
  return { duplicate: false, matched: true, order_id: orderId };
};

const first = await processResendDeliveryEvent(
  event("email.delivered"),
  "svix-idempotent",
  applyOnce,
);
const duplicate = await processResendDeliveryEvent(
  event("email.delivered"),
  "svix-idempotent",
  applyOnce,
);
assert.equal(first.matched, true);
assert.equal(duplicate.duplicate, true, "duplicate webhook events are idempotent");

const unmatched = await processResendDeliveryEvent(
  event("email.delivered", { tags: {} }),
  "svix-unmatched",
  async () => ({ duplicate: false, matched: false }),
);
assert.equal(unmatched.matched, false);

console.log("Transactional email delivery matrix passed");
}

runAsyncTests().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
