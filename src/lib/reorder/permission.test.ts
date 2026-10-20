import assert from "node:assert/strict";
import type Stripe from "stripe";

process.env.ORDER_RESUME_TOKEN_SECRET = "unit-test-only-permission-secret";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "unit-test-only";

async function main() {
  const { supabaseServer } = await import("@/lib/supabase-server");
  const { recordCheckoutReminderPermission, reminderPermissionState,
    hasPrescriptionReminderAuthority } =
    await import("./permission");
  const { REMINDER_PERMISSION_VERSION, REMINDER_PERMISSION_WORDING,
    REMINDER_PRIVACY_POLICY_VERSION, PATIENT_AUTHORITY_VERSION,
    PATIENT_AUTHORITY_WORDING } = await import("./permissionCopy");

  const email = "shared@example.test";
  const first = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const second = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const choices = new Map<string, Record<string, unknown>>();
  let suppressed = false;
  let writes = 0;
  supabaseServer.from = ((table: string) => {
    const filters: Record<string, unknown> = {};
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { filters[key] = value; return query; },
      maybeSingle: async () => ({ error: null,
        data: table === "commercial_email_suppressions"
          ? suppressed ? { email_hash: filters.email_hash } : null
          : table === "customer_reminder_choices"
          ? choices.get(String(filters.order_id)) ?? null : null }),
      upsert: async (value: Record<string, unknown>) => {
        if (table !== "customer_reminder_choices") throw new Error("Unexpected table");
        const id = String(value.order_id);
        if (!choices.has(id)) { choices.set(id, value); writes++; }
        return { error: null };
      },
    };
    return query;
  }) as unknown as typeof supabaseServer.from;

  const intent = (status: Stripe.PaymentIntent.Status, orderId = first,
    selected = true, authority = false): Stripe.PaymentIntent => ({
      id: "pi_unit_only", status,
      metadata: { order_id: orderId,
        ...(selected ? { checkout_reminder_request: REMINDER_PERMISSION_VERSION } : {}),
        ...(authority ? { checkout_patient_authority: PATIENT_AUTHORITY_VERSION } : {}) },
    }) as unknown as Stripe.PaymentIntent;
  const order = { id: first, payment_intent_id: "pi_unit_only",
    shipping_email: email, status: "authorized" };

  assert.equal(await reminderPermissionState(first, email), "no_recorded_preference");
  assert.equal(await recordCheckoutReminderPermission(order,
    intent("requires_capture", first, false)), false);
  assert.equal(choices.size, 0, "Unchecked checkout records no affirmative permission");
  await assert.rejects(recordCheckoutReminderPermission(
    { ...order, status: "draft" }, intent("requires_capture")));
  await assert.rejects(recordCheckoutReminderPermission(
    order, intent("requires_payment_method")));
  assert.equal(choices.size, 0, "Abandoned or failed payment records nothing");

  assert.equal(await recordCheckoutReminderPermission(order,
    intent("requires_capture")), true);
  assert.equal(await recordCheckoutReminderPermission(order,
    intent("requires_capture")), true);
  assert.equal(writes, 1, "Authorization retry must not duplicate permission");
  const saved = choices.get(first)!;
  assert.equal(saved.customer_email, email);
  assert.equal(saved.wording, REMINDER_PERMISSION_WORDING);
  assert.equal(saved.wording_version, REMINDER_PERMISSION_VERSION);
  assert.equal(saved.privacy_policy_version, REMINDER_PRIVACY_POLICY_VERSION);
  assert.equal(saved.source, "checkout");
  assert.deepEqual(saved.categories, ["replenishment"]);
  assert.equal(saved.patient_authority_version, null);
  assert.equal(await hasPrescriptionReminderAuthority(first, email), false);
  assert.ok(Number.isFinite(Date.parse(String(saved.recorded_at))));
  assert.equal(await reminderPermissionState(first, email), "affirmatively_requested");
  assert.equal(await reminderPermissionState(second, email), "no_recorded_preference",
    "Shared email does not authorize a different patient order");

  suppressed = true;
  assert.equal(await reminderPermissionState(first, email), "unsubscribed",
    "A later checkout never reverses an existing unsubscribe");
  suppressed = false;
  choices.set(second, { customer_email: email, decision: "declined" });
  assert.equal(await reminderPermissionState(second, email), "explicitly_declined");
  choices.delete(second);
  assert.equal(await recordCheckoutReminderPermission(
    { ...order, id: second, status: "captured" },
    intent("succeeded", second, true, true)), true);
  assert.equal(await reminderPermissionState(second, email), "affirmatively_requested",
    "A later reorder requires its own affirmative selection");
  assert.equal(await hasPrescriptionReminderAuthority(second, email), true);
  assert.equal(choices.get(second)?.patient_authority_version, PATIENT_AUTHORITY_VERSION);
  assert.match(String(choices.get(second)?.wording), new RegExp(PATIENT_AUTHORITY_WORDING));

  console.log("Checkout permission state, payment gate, retry, unsubscribe, shared-email and reorder fixtures passed. No email or payment sent.");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
