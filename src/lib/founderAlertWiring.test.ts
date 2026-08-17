import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const actionRequiredChecks = [
  {
    scenario: "safe OCR exception",
    path: "src/app/api/checkout/authorized/route.ts",
    alertType: '"rx_review_required"',
  },
  {
    scenario: "prescriber mismatch",
    path: "src/app/api/checkout/authorized/route.ts",
    alertType: '"prescriber_verification_required"',
  },
  {
    scenario: "automated ready-to-place order",
    path: "src/app/api/checkout/authorized/route.ts",
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
