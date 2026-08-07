import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const checks = [
  {
    scenario: "authorization",
    path: "src/app/api/checkout/authorized/route.ts",
    alertType: 'type: "order_authorized"',
  },
  {
    scenario: "uploaded Rx",
    path: "src/app/api/orders/[id]/rx-ocr/route.ts",
    alertType: 'type: "rx_uploaded_review"',
  },
  {
    scenario: "verification completed",
    path: "src/app/api/verification/complete/route.ts",
    alertType: 'type: "verification_completed"',
  },
  {
    scenario: "passive verification",
    path: "src/app/api/verification/process/route.ts",
    alertType: 'type: "passive_verification_completed"',
  },
  {
    scenario: "ready to order",
    path: "src/app/api/admin/orders/[id]/route.ts",
    alertType: 'type: "ready_to_order"',
  },
];

for (const check of checks) {
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

console.log("Founder operational alert wiring coverage passed.");
