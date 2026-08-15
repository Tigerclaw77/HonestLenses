import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const workspaceRoot = process.cwd();
const migration = readFileSync(
  join(
    workspaceRoot,
    "supabase",
    "migrations",
    "20260815003525_add_cart_save_recovery_tokens.sql",
  ),
  "utf8",
);
const recoveryRoute = readFileSync(
  join(workspaceRoot, "src", "app", "resume-order", "accept", "route.ts"),
  "utf8",
);
const saveRoute = readFileSync(
  join(workspaceRoot, "src", "app", "api", "cart", "save", "route.ts"),
  "utf8",
);

assert.match(migration, /reusable until expiry/i);
assert.doesNotMatch(migration, /\bused_at\b/i);
assert.doesNotMatch(
  recoveryRoute,
  /consumeToken\("cart_save_tokens"/,
  "cart-save recovery must remain reusable until expiry",
);
assert.match(
  saveRoute,
  /\.from\("cart_save_tokens"\)\s*\.delete\(\)/,
  "a delivery failure must remove the new token so the customer can retry",
);

console.log("Cart-save recovery capability behavior checks passed");
