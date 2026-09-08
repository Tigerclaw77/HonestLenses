import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { founderAlertKey } from "@/lib/founderAlertConfig";
import { recoveryTouchDue, type RecoveryOrder } from "@/lib/recovery";
import {
  processPostAuthorizationNotifications,
  VERIFICATION_INFORMATION_NEEDED_EMAIL_TYPE,
  type PostAuthorizationNotificationDependencies,
  type PostAuthorizationNotificationOrder,
} from "./postAuthorizationNotifications";

process.env.RESEND_API_KEY = "re_unit_only";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only";

const id = "eb5a1671-f92e-4f69-a797-694917d76267";
const missing: PostAuthorizationNotificationOrder = {
  id,
  status: "authorized",
  fulfillment_status: "review",
  verification_status: "information_needed",
  archived: false,
  archived_at: null,
  rx_upload_path: null,
  prescriber_name: null,
  prescriber_practice: null,
  prescriber_phone: null,
  prescriber_fax: null,
  prescriber_email: null,
  shipping_method: "standard",
  shipping_email: "customer@example.test",
};

function recorder() {
  const customerLedger = new Set<string>();
  const founderLedger = new Set<string>();
  const customerCalls: Array<{ to: string; orderId: string }> = [];
  const founderCalls: Array<{ orderId: string; type: string }> = [];
  const dependencies: PostAuthorizationNotificationDependencies = {
    async hasCustomerNotification(orderId, emailType) {
      return customerLedger.has(`${orderId}:${emailType}`);
    },
    async sendCustomerNotification(input) {
      customerCalls.push(input);
      customerLedger.add(
        `${input.orderId}:${VERIFICATION_INFORMATION_NEEDED_EMAIL_TYPE}`,
      );
    },
    async hasFounderNotification(key) {
      return founderLedger.has(key);
    },
    async sendFounderNotification(input) {
      founderCalls.push({ orderId: input.orderId, type: input.type });
      founderLedger.add(
        founderAlertKey({
          orderId: input.orderId,
          type: input.type,
          dedupeSuffix: input.dedupeSuffix,
        }),
      );
    },
  };
  return {
    dependencies,
    customerCalls,
    founderCalls,
    customerLedger,
    founderLedger,
  };
}

async function main() {
const { buildVerificationInformationNeededEmail } = await import("@/lib/email");
const { sendVerificationInformationNeededEmail } = await import("@/lib/email");
const copy = buildVerificationInformationNeededEmail(id);
const photoPosition = copy.text.indexOf("photo or copy");
const prescriberPosition = copy.text.indexOf(
  "prescriber or practice name and phone number",
);
assert.ok(photoPosition >= 0, "the customer email asks for a prescription copy");
assert.ok(
  prescriberPosition > photoPosition,
  "the customer email asks for a copy first and prescriber/practice phone second",
);
assert.equal(
  copy.idempotencyKey,
  `verification-information-needed:${id}`,
  "the provider idempotency key is stable per order",
);

const lowLevelSuppression = await sendVerificationInformationNeededEmail(
  { to: "customer@example.test", orderId: id },
  { hasExistingNotification: async () => true },
);
assert.equal(
  lowLevelSuppression.suppressed,
  true,
  "the shared sender returns before Resend for a durable manual-send marker",
);

const first = recorder();
await processPostAuthorizationNotifications(missing, first.dependencies);
await processPostAuthorizationNotifications(missing, first.dependencies);
assert.equal(first.customerCalls.length, 1, "missing-Rx customer email sends once");
assert.equal(first.founderCalls.length, 1, "founder stuck-order alert sends once");

const manuallyNotified = recorder();
manuallyNotified.customerLedger.add(
  `${id}:${VERIFICATION_INFORMATION_NEEDED_EMAIL_TYPE}`,
);
await processPostAuthorizationNotifications(missing, manuallyNotified.dependencies);
assert.equal(
  manuallyNotified.customerCalls.length,
  0,
  "a durable manual customer notification suppresses the automated customer email",
);
assert.equal(
  manuallyNotified.founderCalls.length,
  1,
  "customer suppression does not suppress the founder alert",
);

const excluded = recorder();
for (const order of [
  { ...missing, archived: true },
  { ...missing, archived_at: "2026-09-08T06:00:00Z" },
  { ...missing, status: "completed" },
  { ...missing, fulfillment_status: "completed" },
]) {
  await processPostAuthorizationNotifications(order, excluded.dependencies);
}
assert.equal(excluded.customerCalls.length, 0, "completed/archived orders get no customer email");
assert.equal(excluded.founderCalls.length, 0, "completed/archived orders get no founder email");

const sufficient = recorder();
await processPostAuthorizationNotifications(
  {
    ...missing,
    verification_status: "pending",
    prescriber_practice: "Example Eye Care",
    prescriber_phone: "312-555-0100",
  },
  sufficient.dependencies,
);
assert.equal(
  sufficient.customerCalls.length,
  0,
  "sufficient prescriber verification information does not trigger missing-info email",
);

const recovery = recorder();
const draft: RecoveryOrder = {
  id,
  status: "draft",
  verification_status: "pending",
  payment_intent_id: null,
  sku: "OASYS_1D_90",
  shipping_email: "customer@example.test",
  updated_at: "2026-09-08T04:00:00Z",
};
assert.equal(
  recoveryTouchDue(draft, new Date("2026-09-08T05:00:00.001Z")),
  1,
  "the existing abandoned-checkout recovery remains eligible",
);
await processPostAuthorizationNotifications(draft, recovery.dependencies);
assert.equal(recovery.customerCalls.length, 0, "recovery cannot substitute for post-checkout email");
assert.equal(recovery.founderCalls.length, 0, "draft recovery does not emit a stuck-order alert");
assert.equal(
  recoveryTouchDue(
    { ...draft, status: "authorized", payment_intent_id: "pi_authorized" },
    new Date("2026-09-08T05:00:00.001Z"),
  ),
  null,
  "an authorized order is excluded from abandoned-checkout recovery",
);

const checkoutSource = readFileSync(
  resolve(process.cwd(), "src/app/checkout/page.tsx"),
  "utf8",
);
const webhookSource = readFileSync(
  resolve(process.cwd(), "src/app/api/webhooks/stripe/route.ts"),
  "utf8",
);
const authorizationSource = readFileSync(
  resolve(process.cwd(), "src/app/api/checkout/authorized/route.ts"),
  "utf8",
);
const returnRouteSource = readFileSync(
  resolve(process.cwd(), "src/app/api/checkout/return/route.ts"),
  "utf8",
);
const returnPageSource = readFileSync(
  resolve(process.cwd(), "src/app/checkout/return/ReturnClient.tsx"),
  "utf8",
);
const verificationSendSource = readFileSync(
  resolve(process.cwd(), "src/app/api/verification/send/route.ts"),
  "utf8",
);
const verificationProcessSource = readFileSync(
  resolve(process.cwd(), "src/app/api/verification/process/route.ts"),
  "utf8",
);
const adminReconciliationSource = readFileSync(
  resolve(process.cwd(), "src/lib/payments/adminPaymentReconciliation.ts"),
  "utf8",
);
const orderOperationsSource = readFileSync(
  resolve(process.cwd(), "src/lib/orderOperationsServer.ts"),
  "utf8",
);
const emailSource = readFileSync(
  resolve(process.cwd(), "src/lib/email.ts"),
  "utf8",
);
const emailDeliverySource = readFileSync(
  resolve(process.cwd(), "src/lib/emailDeliveryServer.ts"),
  "utf8",
);
assert.match(
  checkoutSource,
  /return_url: `\$\{window\.location\.origin\}\/checkout\/return`/,
  "redirect payment methods return through authorization reconciliation",
);
assert.match(webhookSource, /payment_intent\.amount_capturable_updated/);
assert.match(webhookSource, /reconcileAuthorizedPaymentIntent/);
assert.match(authorizationSource, /finalizeCheckoutAuthorization/);
assert.match(returnRouteSource, /finalizeCheckoutAuthorization/);
assert.match(returnPageSource, /fetch\("\/api\/checkout\/return"/);
assert.match(
  verificationSendSource,
  /sendVerificationInformationNeededEmail/,
  "the customer verification endpoint uses the guarded shared sender",
);
assert.match(
  verificationProcessSource,
  /sendVerificationInformationNeededEmail/,
  "the passive processor uses the guarded shared sender",
);
assert.doesNotMatch(
  adminReconciliationSource,
  /finalizeCheckoutAuthorization|sendVerificationInformationNeededEmail/,
  "admin payment reconciliation cannot send the customer notification",
);
assert.doesNotMatch(
  orderOperationsSource,
  /sendVerificationInformationNeededEmail|finalizeCheckoutAuthorization/,
  "order-operations cron cannot send the transactional missing-information email",
);
assert.match(
  orderOperationsSource,
  /if\(order\.status==='draft'\)await processRecovery/,
  "abandoned-order recovery remains limited to drafts",
);
assert.match(
  emailSource,
  /hasExistingNotification = hasVerificationInformationNeededNotification[\s\S]*?if \(await hasExistingNotification\(orderId\)\)[\s\S]*?suppressed: true[\s\S]*?sendEmail\(/,
  "the shared sender checks durable suppression before entering Resend",
);
assert.match(
  emailDeliverySource,
  /verification_information_requested_manually/,
  "durable suppression recognizes the manual audit marker",
);
assert.match(
  emailDeliverySource,
  /order_email_deliveries/,
  "durable suppression recognizes tracked deliveries",
);
assert.match(
  emailDeliverySource,
  /verification_information_needed/,
  "durable suppression is scoped to the missing-information email type",
);

console.log(
  "Post-authorization notification regression tests passed: customer/founder once-only, durable manual suppression, all sender entry points, ordering, exclusions, readiness, and recovery separation.",
);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
