import assert from "node:assert/strict";

process.env.ORDER_RESUME_TOKEN_SECRET = "unit-test-only-schedule-secret";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "unit-test-only";

async function main() {
  const { supabaseServer } = await import("@/lib/supabase-server");
  const { scheduleReorderReminder } = await import("./schedule");
  const { PATIENT_AUTHORITY_VERSION } = await import("./permissionCopy");
  const source = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", status: "captured",
    created_at: new Date().toISOString(), shipping_email: "sample@honestlenses.com",
    shipping_first_name: "Sample", shipping_last_name: "Customer",
    sku: "PRECISION1_30", right_box_count: 1, left_box_count: 2,
    adjusted_right_box_count: null as number | null,
    adjusted_left_box_count: null as number | null,
    adjusted_total_box_count: null as number | null,
    rx: { expires: "2027-05-27", right: { sphere: -2.75 },
      left: { sphere: -3.25 } }, rx_expiration_date: "2027-05-27",
    verification_status: "verified", verification_passed: true,
    verification_completed_at: new Date().toISOString(),
    patient_first_name: "Sample", patient_last_name: "Customer", patient_dob: "1990-01-01" };
  let order = { ...source };
  let suppressed = false;
  let existing = false;
  let evidence = true;
  let patientAuthority = true;
  let customerControl = false;
  let deliveredAt: string | null = null;
  let newerOrder = false;
  const writes: { table: string; operation: string; value: Record<string, unknown> }[] = [];
  supabaseServer.from = ((table: string) => {
    let previous = false;
    let action = "";
    const query = {
      select: () => query, eq: () => query, neq: () => { previous = true; return query; },
      gt: () => query, is: () => query, in: () => query, order: () => query, limit: () => query,
      maybeSingle: async () => ({ data: table === "orders" ? previous
          ? newerOrder ? { id: "newer" } : null : order
        : table === "commercial_email_suppressions" ? suppressed ? { email_hash: "hash" } : null
        : table === "reorder_reminder_preferences" ? existing ? { order_id: order.id, stopped_at: null } : null
        : table === "customer_reminder_choices" ? { customer_email: order.shipping_email,
          decision: "requested", categories: patientAuthority
            ? ["replenishment", "prescription_expiration"] : ["replenishment"],
          patient_authority_version: patientAuthority ? PATIENT_AUTHORITY_VERSION : null }
        : table === "order_events" ? evidence ? { id: "evidence" } : null
        : table === "reorder_reminder_events" ? customerControl ? { id: "control" } : null
        : table === "reorder_reminder_control_tokens" ? null : null, error: null }),
      update: (value: Record<string, unknown>) => { action = "update";
        writes.push({ table, operation: action, value }); return query; },
      upsert: async (value: Record<string, unknown>) => { writes.push({ table,
        operation: "upsert", value }); return { error: null }; },
      then: (resolve: (value: { error: null; data: unknown[] }) => unknown) =>
        resolve({ error: null, data: table === "order_events" && deliveredAt
          ? [{ created_at: deliveredAt, after: { fulfillment_status: "delivered" } }] : [] }),
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
  assert.equal((writes.find(write => write.table === "reorder_reminder_events" &&
    write.operation === "upsert")?.value.details as { estimated_supply_days: number })
    .estimated_supply_days, 30);
  writes.length = 0; patientAuthority = false;
  await scheduleReorderReminder(order.id);
  assert.equal(writes.find(write => write.table === "reorder_reminder_preferences" &&
    write.operation === "upsert")?.value.next_expiration_at, null,
  "Patient-specific expiration is absent without authority evidence");
  patientAuthority = true;
  writes.length = 0;
  order = { ...source, patient_last_name: "Different" };
  await scheduleReorderReminder(order.id);
  assert.equal(writes.find(write => write.table === "reorder_reminder_preferences" &&
    write.operation === "upsert")?.value.next_expiration_at, null,
  "A proxy purchase cannot schedule a patient-specific alert");
  writes.length = 0;
  order = { ...source, adjusted_right_box_count: 2,
    adjusted_left_box_count: 2, adjusted_total_box_count: 4 };
  await scheduleReorderReminder(order.id);
  assert.equal((writes.find(write => write.table === "reorder_reminder_events" &&
    write.operation === "upsert")?.value.details as { estimated_supply_days: number })
    .estimated_supply_days, 60, "Adjusted captured quantities define purchased supply");
  writes.length = 0; newerOrder = true;
  await scheduleReorderReminder(order.id);
  assert.equal(writes.length, 0, "An older capture cannot supersede a later purchase");
  newerOrder = false; order = { ...source };

  writes.length = 0; existing = true;
  await scheduleReorderReminder(order.id);
  assert.equal(writes.length, 0, "Webhook replay must not reset the schedule");
  deliveredAt = new Date(Date.now() + 3 * 86_400_000).toISOString();
  await scheduleReorderReminder(order.id, { refreshDelivery: true });
  assert.ok(writes.some(write => write.table === "reorder_reminder_preferences" &&
    write.operation === "update" && typeof write.value.next_reminder_at === "string"),
  "Confirmed delivery refreshes only the existing reminder");
  writes.length = 0; customerControl = true;
  await scheduleReorderReminder(order.id, { refreshDelivery: true });
  assert.equal(writes.length, 0, "Customer-selected reminder date must be preserved");
  customerControl = false; deliveredAt = null;
  existing = false; suppressed = true;
  await scheduleReorderReminder(order.id);
  assert.equal(writes.length, 0, "Opted-out recipient must not be scheduled");
  suppressed = false; evidence = false;
  await scheduleReorderReminder(order.id);
  assert.equal(writes.find(write => write.table === "reorder_reminder_preferences" &&
    write.operation === "upsert")?.value.next_expiration_at, null,
  "Unverified expiration must not be scheduled");
  writes.length = 0; order = { ...source, sku: "UNKNOWN" };
  await scheduleReorderReminder(order.id);
  assert.ok(writes.some(write => write.table === "reorder_reminder_preferences" &&
    write.operation === "update"));
  assert.ok(!writes.some(write => write.table === "reorder_reminder_preferences" &&
    write.operation === "upsert"),
  "Unknown supply invalidates an older purchase schedule without inventing a new date");
  writes.length = 0; evidence = true; order = { ...source, shipping_email: "test@example.com" };
  await scheduleReorderReminder(order.id);
  assert.equal(writes.length, 0, "Synthetic identity must be skipped");
  order = { ...source, status: "cancelled" };
  await scheduleReorderReminder(order.id);
  assert.equal(writes.length, 0, "Canceled order must be skipped");
  console.log("Recall scheduling, verified expiry, replay, opt-out, synthetic, and canceled fixtures passed. No email sent.");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
