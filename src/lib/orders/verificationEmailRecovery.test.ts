import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { classifyOperationalQueue } from "./operationalQueue";
import { getNextAction } from "./getNextAction";
import { getCurrentEmailDeliveryIssue, type EmailDeliveryAttempt } from "./emailDeliveryIssue";
import { resendVerificationRequest } from "./verificationEmailResend";

const baseOrder = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "authorized",
  payment_intent_id: "pi_test",
  stripe_payment_intent_status: "requires_capture",
  verification_status: "pending",
  fulfillment_status: "review",
  prescriber_name: "Example Prescriber",
  prescriber_email: "old@example.com",
};
const deliveredCustomer: EmailDeliveryAttempt = {
  order_id: baseOrder.id,
  email_type: "order_confirmation",
  recipient: "customer@example.com",
  delivery_status: "delivered",
  last_event_at: "2026-08-29T12:00:00.000Z",
  sent_at: "2026-08-29T11:59:00.000Z",
};
const bouncedPrescriber: EmailDeliveryAttempt = {
  order_id: baseOrder.id,
  email_type: "verification_request",
  recipient: "bounced-prescriber@example.com",
  delivery_status: "bounced",
  last_event_at: "2026-08-29T12:05:00.000Z",
  sent_at: "2026-08-29T12:01:00.000Z",
};

const prescriberIssue = getCurrentEmailDeliveryIssue([deliveredCustomer, bouncedPrescriber]);
assert.equal(prescriberIssue?.kind, "prescriber");
assert.equal(prescriberIssue?.recipient, "bounced-prescriber@example.com");
const prescriberOrder = { ...baseOrder, email_delivery_issue: prescriberIssue };
assert.equal(getNextAction(prescriberOrder).label, "Correct prescriber email");
assert.deepEqual(classifyOperationalQueue(prescriberOrder).reasons, [
  "Prescription verification email could not be delivered to bounced-prescriber@example.com. Confirm or correct the prescriber email address.",
]);

const customerIssue = getCurrentEmailDeliveryIssue([{ ...deliveredCustomer, delivery_status: "bounced" }]);
assert.equal(customerIssue?.kind, "customer");
const customerOrder = { ...baseOrder, email_delivery_issue: customerIssue };
assert.equal(getNextAction(customerOrder).label, "Correct customer email");
assert.deepEqual(classifyOperationalQueue(customerOrder).reasons, [
  "Customer email could not be delivered; confirm or correct the email address.",
]);

async function testResendRecovery() {
const attempts = [bouncedPrescriber];
let storedEmail = "old@example.com";
let auditCount = 0;
await resendVerificationRequest(
  { ...baseOrder, patient_first_name: "Test", patient_last_name: "Patient" },
  "corrected@example.com",
  {
    updatePrescriberEmail: async (email) => { storedEmail = email; },
    send: async (message) => {
      assert.equal(message.to, "corrected@example.com");
      assert.deepEqual(message.tracking, { orderId: baseOrder.id, emailType: "verification_request" });
      assert.equal(message.trackingRequired, true);
      attempts.push({
        order_id: baseOrder.id,
        email_type: message.tracking.emailType,
        recipient: message.to,
        delivery_status: "sent",
        last_event_at: "2026-08-29T12:15:00.000Z",
        sent_at: "2026-08-29T12:15:00.000Z",
      });
    },
    recordAuditEvent: async () => { auditCount += 1; },
  },
  new Date("2026-08-29T12:15:00.000Z"),
);
assert.equal(storedEmail, "corrected@example.com");
assert.equal(attempts.length, 2, "the prior bounced attempt is preserved");
assert.equal(attempts[0].delivery_status, "bounced");
assert.equal(attempts[1].delivery_status, "sent");
assert.equal(auditCount, 1);
assert.equal(getCurrentEmailDeliveryIssue(attempts), null);
assert.notEqual(
  getNextAction({
    ...baseOrder,
    email_delivery_status: "bounced",
    email_delivery_requires_attention: true,
    email_delivery_issue: getCurrentEmailDeliveryIssue(attempts),
  }).label,
  "Correct customer email",
);

}

const routeSource = readFileSync("src/app/api/admin/orders/[id]/verification-email/route.ts", "utf8");
assert.doesNotMatch(routeSource, /Stripe|paymentIntents|\.capture\(|\.refund\(/i);
assert.doesNotMatch(routeSource, /supplier|manufacturer/i);
assert.doesNotMatch(routeSource, /update\(\{[\s\S]*?verification_status/);

testResendRecovery().then(() => {
  console.log("Verification email classification and safe resend regression tests passed.");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
