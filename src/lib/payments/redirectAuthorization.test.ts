import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  decideRedirectAuthorization,
  isAuthorizedDraftPaymentIntentStatus,
} from "./redirectAuthorization";

const order = {
  id: "59d4f6e7-af19-40ee-b0ca-fa4345ba05f2",
  payment_intent_id: "pi_cashapp",
  status: "draft",
  verification_status: "pending",
  total_amount_cents: 13_998,
  feedback_credit_cents: 0,
  rx_upload_path: null,
  rx_status: "manual",
  prescriber_name: null,
  prescriber_practice: null,
  prescriber_phone: null,
  prescriber_fax: null,
  prescriber_email: null,
  verification_details_submitted_at: null,
};

const intent = {
  id: "pi_cashapp",
  status: "requires_capture",
  amount: 13_998,
  metadata: { order_id: order.id },
};

const firstReturn = decideRedirectAuthorization({
  order,
  intent,
  expectedAmountCents: 13_998,
});
assert.deepEqual(firstReturn, {
  ok: true,
  idempotent: false,
  next: "verification-details",
});

assert.deepEqual(
  decideRedirectAuthorization({
    order: { ...order, status: "authorized", verification_status: "information_needed" },
    intent,
    expectedAmountCents: 13_998,
  }),
  { ok: true, idempotent: true, next: "verification-details" },
);

assert.equal(isAuthorizedDraftPaymentIntentStatus("requires_capture"), true);
assert.equal(isAuthorizedDraftPaymentIntentStatus("succeeded"), false);

assert.equal(
  decideRedirectAuthorization({
    order,
    intent: { ...intent, metadata: { order_id: "other-order" } },
    expectedAmountCents: 13_998,
  }).ok,
  false,
);
assert.equal(
  decideRedirectAuthorization({
    order,
    intent: { ...intent, status: "requires_payment_method" },
    expectedAmountCents: 13_998,
  }).ok,
  false,
);

const source = (...segments: string[]) =>
  readFileSync(join(process.cwd(), ...segments), "utf8");
const checkoutPage = source("src", "app", "checkout", "page.tsx");
const payRoute = source("src", "app", "api", "checkout", "pay", "route.ts");
const returnRoute = source("src", "app", "api", "checkout", "return", "route.ts");
const webhookRoute = source("src", "app", "api", "webhooks", "stripe", "route.ts");
const finalizer = source("src", "lib", "payments", "checkoutAuthorizationFinalizer.ts");

assert.match(
  checkoutPage,
  /return_url: `\$\{window\.location\.origin\}\/checkout\/return`/,
  "redirect-capable Payment Element methods return through reconciliation, not success",
);
assert.match(
  checkoutPage,
  /PAYMENT_ALREADY_AUTHORIZED[\s\S]*\/checkout\/return\?payment_intent=/,
  "checkout recovery routes an already-authorized draft to reconciliation",
);
assert.match(
  checkoutPage,
  /orderData\.status === "authorized"[\s\S]*\/checkout\/return\?payment_intent=/,
  "a recovery link opened after webhook reconciliation does not restart payment initialization",
);
assert.doesNotMatch(
  payRoute.match(/const REUSABLE_STATUSES = \[[\s\S]*?\];/)?.[0] ?? "",
  /requires_capture/,
  "a capturable authorization is never handed back to Payment Element for reconfirmation",
);
assert.match(
  payRoute,
  /code: "PAYMENT_ALREADY_AUTHORIZED"/,
  "checkout initialization has a safe recovery result for an authorized draft",
);
assert.match(
  returnRoute,
  /intent\.metadata\?\.order_id[\s\S]*payment_intent_id[\s\S]*canAccessOrder/,
  "return reconciliation requires Stripe metadata binding, persisted intent binding, and customer access",
);
assert.doesNotMatch(
  returnRoute,
  /paymentIntents\.(?:create|confirm|capture)/,
  "return reconciliation never creates, confirms, or captures a payment",
);
assert.match(
  webhookRoute,
  /payment_intent\.amount_capturable_updated[\s\S]*reconcileAuthorizedPaymentIntent/,
  "a verified Stripe authorization webhook backstops browser close and lost redirects",
);
assert.match(
  finalizer,
  /if \(orderStatus === nextStatus && verificationStatus === nextVerificationStatus\)/,
  "repeat return/webhook reconciliation is idempotent before email side effects",
);
assert.match(
  finalizer,
  /allowAutomaticCapture = false/,
  "the reconciliation finalizer defaults to no capture",
);

console.log("redirect authorization regression tests passed");
