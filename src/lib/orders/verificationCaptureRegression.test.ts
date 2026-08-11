import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

assert.match(
  verifyRoute,
  /captureAuthorizedOrderPayment\([\s\S]*"admin-verification"/,
  "admin verification keeps Stripe capture coupled to approval",
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
  /fetch\(`\/api\/orders\/\$\{order\.id\}\/verify`/,
  "the admin work queue exposes the verify-and-capture endpoint",
);
assert.match(
  adminPage,
  /Verify prescription & capture payment/,
  "the founder action states that capture is part of verification",
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

console.log("Verification/capture regression tests passed.");
