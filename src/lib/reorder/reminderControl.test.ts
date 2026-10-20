import assert from "node:assert/strict";

process.env.ORDER_RESUME_TOKEN_SECRET = "unit-test-recall-control";
process.env.RATE_LIMIT_KEY_SECRET = "unit-test-rate-limit";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "unit-test-only";

async function main() {
  const { supabaseServer } = await import("@/lib/supabase-server");
  const { createReminderControlToken, hashReorderToken } = await import("./tokens");
  const { POST } = await import("@/app/api/reminders/control/route");
  const orderId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const emailHash = "a".repeat(64);
  const preference = { order_id: orderId, email_hash: emailHash,
    stopped_at: null as string | null, next_reminder_at: null as string | null,
    next_expiration_at: null as string | null };
  let suppressed = false;
  const writes: { table: string; value: Record<string, unknown> }[] = [];
  supabaseServer.rpc = (async () => ({ data: true, error: null })) as unknown as typeof supabaseServer.rpc;
  supabaseServer.from = ((table: string) => {
    const filters: Record<string, unknown> = {};
    const query = {
      select: () => query, eq: (key: string, value: unknown) => {
        filters[key] = value; return query; },
      is: () => query, order: () => query, limit: () => query,
      maybeSingle: async () => ({ error: null, data:
        table === "reorder_reminder_control_tokens"
          ? filters.token_hash === hashReorderToken(createReminderControlToken(orderId,
            filters.action as "stop" | "postpone_30")) ? { order_id: orderId } : null
          : table === "reorder_reminder_preferences" ? preference
          : table === "commercial_email_suppressions" ? suppressed ? { email_hash: emailHash } : null
          : table === "orders" ? filters.id ? { shipping_email: "internal@example.test" }
            : { id: orderId } : null }),
      update: (value: Record<string, unknown>) => { writes.push({ table, value });
        Object.assign(preference, table === "reorder_reminder_preferences" ? value : {});
        return query; },
      upsert: async (value: Record<string, unknown>) => { writes.push({ table, value });
        if (table === "commercial_email_suppressions") suppressed = true;
        return { error: null }; },
      insert: async (value: Record<string, unknown>) => { writes.push({ table, value });
        return { error: null }; },
      then: (resolve: (value: { error: null }) => unknown) => resolve({ error: null }),
    };
    return query;
  }) as unknown as typeof supabaseServer.from;
  const request = (action: "stop" | "postpone_30", token: string) => new Request(
    "https://example.test/api/reminders/control", { method: "POST",
      headers: { origin: "https://example.test", "Content-Type": "application/json" },
      body: JSON.stringify({ action, token }) });
  const postpone = await POST(request("postpone_30", createReminderControlToken(orderId, "postpone_30")));
  assert.equal(postpone.status, 200);
  assert.ok(preference.next_reminder_at && Date.parse(preference.next_reminder_at) > Date.now());
  assert.ok(writes.some(write => write.table === "reorder_reminder_events"));
  const stop = await POST(request("stop", createReminderControlToken(orderId, "stop")));
  assert.equal(stop.status, 200);
  assert.equal(suppressed, true);
  assert.ok(preference.stopped_at);
  assert.equal(preference.next_reminder_at, null);
  assert.equal((await POST(request("postpone_30",
    createReminderControlToken(orderId, "postpone_30")))).status, 410);
  assert.equal((await POST(request("stop", "x".repeat(43)))).status, 410);
  console.log("Stop and postpone controls passed with isolated mocked records. No email sent.");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
