import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { Webhook } from "svix";

import { handleResendWebhook } from "@/app/api/webhooks/resend/route";
import { getInboundEmailForwardRecipient } from "./inboundEmailForwarding";

assert.equal(
  getInboundEmailForwardRecipient({
    INBOUND_EMAIL_FORWARD_RECIPIENT: "pauldriggers@aol.com",
  }),
  "pauldriggers@aol.com",
);
assert.throws(
  () => getInboundEmailForwardRecipient({}),
  /not configured/,
);

const secret = `whsec_${randomBytes(32).toString("base64")}`;
const body = JSON.stringify({
  type: "email.received",
  created_at: "2026-08-18T20:00:00.000Z",
  data: {
    email_id: "received-email-1",
    created_at: "2026-08-18T19:59:59.000Z",
    from: "admalialtake@gmail.com",
    to: ["support-replies@inbound.resend.app"],
    subject: "Re: Additional Information Needed",
  },
});
const webhookId = "svix-inbound-route";
const signedAt = new Date();
const signature = new Webhook(secret).sign(webhookId, signedAt, body);
let receivedInput: unknown;

async function run() {
  const response = await handleResendWebhook(
    new Request("https://www.honestlenses.com/api/webhooks/resend", {
      method: "POST",
      headers: {
        "svix-id": webhookId,
        "svix-timestamp": String(Math.floor(signedAt.getTime() / 1000)),
        "svix-signature": signature,
      },
      body,
    }),
    {
      webhookSecret: secret,
      forwardInboundEmail: async (input) => {
        receivedInput = input;
        return {
          forwarded: true,
          duplicate: false,
          forwardedEmailId: "forwarded-email-1",
        };
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    received: true,
    inbound: true,
    forwarded: true,
    duplicate: false,
    forwardedEmailId: "forwarded-email-1",
  });
  assert.deepEqual(receivedInput, {
    svixId: webhookId,
    emailId: "received-email-1",
    receivedAt: "2026-08-18T19:59:59.000Z",
    sender: "admalialtake@gmail.com",
    recipient: "support-replies@inbound.resend.app",
  });

  console.log("Inbound email forwarding webhook tests passed.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
