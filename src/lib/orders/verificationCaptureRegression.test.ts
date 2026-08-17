import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getCaptureReadiness } from "./captureReadiness";
import { getNextAction, getVerificationState } from "./getNextAction";
import { runVerificationCaptureWorkflow } from "./verificationCaptureWorkflow";

function source(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), "utf8");
}

const verifyRoute = source(
  "src",
  "app",
  "api",
  "orders",
  "[id]",
  "verify",
  "route.ts",
);
const adminPage = source("src", "app", "admin", "orders", "page.tsx");
const adminPatchRoute = source(
  "src",
  "app",
  "api",
  "admin",
  "orders",
  "[id]",
  "route.ts",
);
const founderOverrideRoute = source(
  "src", "app", "api", "admin", "orders", "[id]", "founder-override", "route.ts",
);
const founderOverrideMigration = source(
  "supabase", "migrations", "20260901194500_add_atomic_founder_verification_override.sql",
);

assert.match(
  verifyRoute,
  /captureAuthorizedOrderPayment\([\s\S]*"admin-verification"/,
  "admin verification keeps Stripe capture coupled to approval",
);

const capturedPendingVerification = {
  status: "captured",
  verification_status: "pending",
  fulfillment_status: "review",
  rx: { right: { sphere: "-2.00" } },
};
assert.equal(
  getVerificationState(capturedPendingVerification).complete,
  false,
  "a Stripe webhook marking payment captured never substitutes for a local prescription verification",
);
assert.equal(
  getNextAction(capturedPendingVerification).label,
  "Verify prescription",
  "captured-but-pending orders remain on the safe verification recovery path",
);
assert.doesNotMatch(
  verifyRoute,
  /verified_lens:\s*body\.verified_lens/,
  "verification only writes columns present in the orders table",
);
assert.match(
  verifyRoute,
  /const \{ id: orderId \} = await context\.params;[\s\S]*\.eq\("id", orderId\)[\s\S]*\.single\(\)/,
  "verification loads the exact order ID submitted by the displayed admin card",
);
assert.match(
  verifyRoute,
  /payment_intent_id/,
  "verification loads the selected order's stored PaymentIntent",
);
assert.match(
  verifyRoute,
  /\.eq\("payment_intent_id", order\.payment_intent_id\)/,
  "post-capture persistence remains bound to the selected order's PaymentIntent",
);
assert.doesNotMatch(
  verifyRoute,
  /authorization_expires_at/,
  "verification does not select the absent authorization_expires_at column and misreport the query failure as an unknown order",
);
assert.match(
  verifyRoute,
  /if \(orderError\)[\s\S]*ORDER_LOOKUP_FAILED[\s\S]*if \(!order\)[\s\S]*Order not found/,
  "database lookup failures and genuinely missing orders remain distinct and fail safely",
);
assert.match(
  verifyRoute,
  /\.select\("id, status, verification_status"\)[\s\S]*\.maybeSingle\(\)/,
  "verification checks that the local post-capture state update matched",
);
assert.match(
  verifyRoute,
  /\.in\("status", \["authorized", "captured"\]\)/,
  "verification reconciles a Stripe webhook race that already marked the order captured",
);
assert.match(
  verifyRoute,
  /CAPTURED_STATE_UPDATE_FAILED/,
  "post-capture persistence failure is explicit and retryable",
);
assert.match(
  verifyRoute,
  /CAPTURE_NOT_CONFIRMED/,
  "unconfirmed Stripe capture is not reported as success",
);
assert.match(
  adminPage,
  /fetch\(`\/api\/admin\/orders\/\$\{order\.id\}\/founder-override`/,
  "the admin work queue exposes the authenticated founder-override endpoint",
);
assert.match(
  adminPage,
  /Founder Override & capture payment/,
  "the founder action is explicit and states that capture is part of verification",
);
assert.match(
  adminPage,
  /founderOverrideEligible && \(/,
  "review exceptions are not gated to one queue bucket",
);
assert.match(
  adminPage,
  /CAPTURE\/VERIFICATION NOT COMPLETE/,
  "a failed verify request remains unmistakable in the order card",
);
assert.match(
  adminPatchRoute,
  /RX_VERIFICATION_REQUIRED/,
  "generic fulfillment updates cannot bypass uploaded-Rx verification",
);
assert.match(founderOverrideRoute, /requireAdminUser\(req\)/, "founder override requires admin authentication");
assert.match(founderOverrideRoute, /isFounderOverrideEligible\(order\)/, "server rechecks review eligibility");
assert.match(founderOverrideRoute, /"admin-verification"/, "override retains guarded payment capture");
assert.match(founderOverrideRoute, /apply_founder_verification_override/, "override uses the atomic database transition");
assert.match(founderOverrideMigration, /verification_method = 'admin'/, "override records its canonical method");
assert.match(founderOverrideMigration, /verification_passed = true/, "override records successful verification");
assert.match(founderOverrideMigration, /verification_status = 'verified'/, "override records canonical verified status");
assert.match(founderOverrideMigration, /verification_completed_at = now\(\)/, "override records completion time");
assert.match(founderOverrideMigration, /fulfillment_status = 'ready_to_order'/, "override advances fulfillment after capture");
assert.match(founderOverrideMigration, /insert into public\.order_events/, "state and audit event share one transaction");

async function assertCapturedRetryReconcilesWithoutAnotherStripeCapture() {
  let stripeCaptureCalls = 0;
  let persistenceAttempts = 0;
  const reconcilePayment = async () => {
    const readiness = getCaptureReadiness(
      { payment_intent_id: "pi_captured" },
      { id: "pi_captured", status: "succeeded" },
    );
    if (readiness.shouldCapture) stripeCaptureCalls += 1;
    assert.equal(readiness.reason, "already_captured");
    return { paymentIntentId: "pi_captured", alreadyCaptured: true };
  };

  const failedWrite = await runVerificationCaptureWorkflow({
    reconcilePayment,
    persistVerifiedState: async () => {
      persistenceAttempts += 1;
      throw new Error("simulated post-capture state-write failure");
    },
  });
  assert.deepEqual(failedWrite, {
    ok: false,
    stage: "persistence",
    capture: { paymentIntentId: "pi_captured", alreadyCaptured: true },
  });

  const recovered = await runVerificationCaptureWorkflow({
    reconcilePayment,
    persistVerifiedState: async () => {
      persistenceAttempts += 1;
      return { id: "order-captured", status: "captured", verification_status: "verified" };
    },
  });
  assert.equal(recovered.ok, true);
  assert.equal(stripeCaptureCalls, 0, "a succeeded PaymentIntent never invokes Stripe capture during retry");
  assert.equal(persistenceAttempts, 2, "the retry re-attempts only the local verified-state write");
}

void assertCapturedRetryReconcilesWithoutAnotherStripeCapture()
  .then(() => console.log("Verification/capture regression tests passed."))
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
