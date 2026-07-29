import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260729144510_create_commerce_v2_phase1.sql",
  ),
  "utf8",
);

for (const table of [
  "orders",
  "order_items",
  "payments",
  "payment_events",
  "prescription_verifications",
  "fulfillments",
  "order_adjustments",
  "order_events",
]) {
  assert.match(migration, new RegExp(`create table commerce_v2\\.${table}\\b`));
}

for (const appendOnlyTable of [
  "payment_events",
  "prescription_verification_events",
  "fulfillment_events",
  "order_adjustments",
  "order_events",
]) {
  assert.match(
    migration,
    new RegExp(`create trigger ${appendOnlyTable}_append_only`),
  );
}

assert.match(migration, /unique \(stripe_payment_intent_id\)|text not null unique/);
assert.match(migration, /stripe_event_id text primary key/);
assert.match(
  migration,
  /last_projection_observed_at <= excluded\.last_projection_observed_at/,
);
assert.match(migration, /with \(security_invoker = true\)/);
assert.match(migration, /revoke all on schema commerce_v2 from public, anon, authenticated/);
assert.match(migration, /raise exception '% is a read-only legacy archive'/);
assert.match(migration, /'admin_override'/);
assert.match(migration, /length\(trim\(coalesce\(p_reason, ''\)\)\) = 0/);

const queueBranches = [
  "action_required",
  "awaiting_payment",
  "awaiting_verification",
  "ready_to_fulfill",
  "in_fulfillment",
  "cancelled",
  "completed",
];
for (const queue of queueBranches) {
  assert.match(migration, new RegExp(`'${queue}'`));
}
assert.match(
  migration,
  /operational_queue = 'action_required'\s+and action_required_reason is null/,
);

for (const metric of [
  "orphaned_orders",
  "impossible_states",
  "stripe_database_mismatches",
  "missing_action_required_reasons",
  "webhook_failures",
  "reconciliation_failures",
]) {
  assert.match(migration, new RegExp(`'${metric}'`));
}

assert.doesNotMatch(
  migration,
  /references auth\.users/,
  "account deletion must not invalidate accounting history",
);
assert.doesNotMatch(
  migration,
  /on delete cascade/,
  "canonical and audit records must not cascade-delete",
);

console.log("commerce v2 schema contract tests passed");
