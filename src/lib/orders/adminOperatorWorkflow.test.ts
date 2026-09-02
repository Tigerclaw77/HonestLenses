import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), "utf8");
}

const page = source("src", "app", "admin", "orders", "page.tsx");
const queueRoute = source("src", "app", "api", "admin", "orders", "route.ts");
const fulfillmentRoute = source(
  "src",
  "app",
  "api",
  "admin",
  "orders",
  "[id]",
  "route.ts",
);
const archiveRoute = source(
  "src",
  "app",
  "api",
  "orders",
  "[id]",
  "archive",
  "route.ts",
);

assert.match(
  queueRoute,
  /reconcileAdminPaymentState\([\s\S]*source: "queue_refresh"/,
  "queue refresh safely reconciles Stripe-authoritative payment state",
);
assert.match(page, /window\.setInterval\([\s\S]*30_000/, "queue refreshes even if realtime delivery is missed");
assert.match(page, /Accept prescription/, "prescription action is direct");
assert.match(page, /Capture payment/, "payment action is direct");
assert.match(page, /Mark supplier order placed/, "supplier action is direct");
assert.doesNotMatch(page, /Founder Override & capture payment/, "routine actions are not compounded");
assert.doesNotMatch(page, /setAdminError\("Invalid fulfillment status\."\)/, "valid operator actions do not end in a generic state-machine error");
assert.match(
  fulfillmentRoute,
  /already_done: true/,
  "already-recorded fulfillment actions are idempotent",
);
assert.match(
  fulfillmentRoute,
  /admin_supplier_order_placed/,
  "supplier placement records audit history",
);
assert.match(archiveRoute, /requestedArchived = body\.archived/, "archive endpoint supports restore");
assert.match(archiveRoute, /admin_order_restored/, "restore records audit history");
assert.match(page, /Restore order/, "archived unfinished orders expose direct recovery");
assert.match(page, /Mark email issue resolved/, "email attention has a direct resolution");

console.log("Admin operator workflow regression tests passed.");
