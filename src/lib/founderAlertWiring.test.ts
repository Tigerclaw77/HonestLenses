import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const actionRequiredChecks = [
  {
    scenario: "safe OCR exception",
    path: "src/lib/payments/checkoutAuthorizationFinalizer.ts",
    alertType: '"rx_review_required"',
  },
  {
    scenario: "prescriber mismatch",
    path: "src/lib/payments/checkoutAuthorizationFinalizer.ts",
    alertType: '"prescriber_verification_required"',
  },
  {
    scenario: "automated ready-to-place order",
    path: "src/lib/payments/checkoutAuthorizationFinalizer.ts",
    alertType: 'type: "ready_to_place"',
  },
  {
    scenario: "prescriber-verified order",
    path: "src/app/api/verification/complete/route.ts",
    alertType: 'type: "ready_to_place"',
  },
  {
    scenario: "passive verified order",
    path: "src/app/api/verification/process/route.ts",
    alertType: 'type: "ready_to_place"',
  },
];

for (const check of actionRequiredChecks) {
  const route = source(check.path);
  assert.match(
    route,
    /sendFounderOperationalAlert/,
    `${check.scenario} invokes the founder-only alert helper`,
  );
  assert.ok(
    route.includes(check.alertType),
    `${check.scenario} uses the expected founder-alert type`,
  );
}

const uploadedRxRoute = source("src/app/api/orders/[id]/rx-ocr/route.ts");
assert.doesNotMatch(
  uploadedRxRoute,
  /sendFounderOperationalAlert/,
  "an upload alone is not founder work until automation classifies the evidence",
);

const checkoutFinalizer = source("src/lib/payments/checkoutAuthorizationFinalizer.ts");
assert.match(
  checkoutFinalizer,
  /getFounderVerificationAttention[\s\S]*sendFounderVerificationAttention/,
  "authorized or completed orders with incomplete verification use the shared founder alert path",
);
assert.match(
  checkoutFinalizer,
  /if \(orderStatus === nextStatus[\s\S]*await sendFounderVerificationAttention\(\)/,
  "redirect and webhook retry replays retry the durable alert delivery without changing checkout state",
);

const founderAlerts = source("src/lib/founderAlerts.ts");
assert.match(
  founderAlerts,
  /select\("resend_email_id, sent_at"\)[\s\S]*previous\?\.resend_email_id \|\| previous\?\.sent_at/,
  "a successful audit row deduplicates alerts even if the provider does not return an email ID",
);
assert.doesNotMatch(
  source("src/app/api/orders/[id]/verify/route.ts"),
  /sendFounderOperationalAlert/,
  "manual work never generates a redundant founder email",
);
assert.doesNotMatch(
  source("src/app/api/admin/orders/[id]/route.ts"),
  /sendFounderOperationalAlert/,
  "recording an internal placement transition never generates a redundant founder email",
);

console.log("Founder operational alert wiring coverage passed.");
