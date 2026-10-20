import assert from "node:assert/strict";

process.env.ORDER_RESUME_TOKEN_SECRET = "unit-test-only-schedule-secret";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "unit-test-only";

async function main() {
  const { supabaseServer } = await import("@/lib/supabase-server");
  const { scheduleReorderReminder } = await import("./schedule");
  const source = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", status: "captured",
    created_at: new Date().toISOString(), shipping_email: "sample@honestlenses.com",
    shipping_first_name: "Sample", shipping_last_name: "Customer",
    sku: "PRECISION1_30", right_box_count: 1, left_box_count: 2,
    rx: { expires: "2027-05-27" }, rx_expiration_date: "2027-05-27",
    verification_status: "verified", verification_passed: true,
    verification_completed_at: new Date().toISOString(),
    patient_first_name: "Sample", patient_last_name: "Patient", patient_dob: "1990-01-01" };
  let order = { ...source };
  let suppressed = false;
  let existing = false;
  let evidence = true;
  const writes: { table: string; operation: string; value: Record<string, unknown> }[] = [];
  supabaseServer.from = ((table: string) => {
    let previous = false;
    let action = "";
    const query = {
      select: () => query, eq: () => query, neq: () => { previous = true; return query; },
      is: () => query, in: () => query, order: () => query, limit: () => query,
      maybeSingle: async () => ({ data: table === "orders" ? previous ? null : order
        : table === "commercial_email_suppressions" ? suppressed ? { email_hash: "hash" } : null
        : table === "reorder_reminder_preferences" ? existing ? { order_id: order.id, stopped_at: null } : null
        : table === "order_events" ? evidence ? { id: "evidence" } : null
        : table === "reorder_reminder_control_tokens" ? null : null, error: null }),
      update: (value: Record<string, unknown>) => { action = "update";
        writes.push({ table, operation: action, value }); return query; },
      upsert: async (value: Record<string, unknown>) => { writes.push({ table,
        operation: "upsert", value }); return { error: null }; },
      then: (resolve: (value: { error: null }) => unknown) => resolve({ error: null }),
    };
    return query;
  }) as unknown as typeof supabaseServer.from;

  await scheduleReorderReminder(order.id);
  const scheduled = writes.find(write => write.table === "reorder_reminder_preferences" &&
    write.operation === "upsert");
  assert.ok(scheduled, "Captured order should create an inert preference");
  assert.equal(scheduled.value.next_expiration_at, "2027-04-12T12:00:00.000Z");
  assert.equal(typeof scheduled.value.next_reminder_at, "string");
  assert.ok(writes.some(write => write.table === "reorder_reminder_events" &&
    (write.value.details as { expiration_scheduled: boolean }).expiration_scheduled));

  writes.length = 0; existing = true;
  await scheduleReorderReminder(order.id);
  assert.equal(writes.length, 0, "Webhook replay must not reset the schedule");
  existing = false; suppressed = true;
  await scheduleReorderReminder(order.id);
  assert.equal(writes.length, 0, "Opted-out recipient must not be scheduled");
  suppressed = false; evidence = false;
  await scheduleReorderReminder(order.id);
  assert.equal(writes.find(write => write.table === "reorder_reminder_preferences" &&
    write.operation === "upsert")?.value.next_expiration_at, null,
  "Unverified expiration must not be scheduled");
  writes.length = 0; evidence = true; order = { ...source, shipping_email: "test@example.com" };
  await scheduleReorderReminder(order.id);
  assert.equal(writes.length, 0, "Synthetic identity must be skipped");
  order = { ...source, status: "cancelled" };
  await scheduleReorderReminder(order.id);
  assert.equal(writes.length, 0, "Canceled order must be skipped");
  console.log("Recall scheduling, verified expiry, replay, opt-out, synthetic, and canceled fixtures passed. No email sent.");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
