// Read-only inventory; never creates capabilities, mutates orders, or sends mail.
import { supabaseServer } from "../src/lib/supabase-server";
import { RECOVERY_ORDER_FIELDS, getVerifiedResumeDestination } from "../src/lib/recoveryServer";
import { recoveryTouchDue, type RecoveryOrder } from "../src/lib/recovery";

async function main() {
  const now = new Date();
  let cursor = "";
  const counts = { hour1: 0, hour24: 0, excluded: 0, alreadyDrafted: 0 };
  for (;;) {
    const { data, error } = await supabaseServer.from("orders").select(RECOVERY_ORDER_FIELDS)
      .eq("status", "draft").gte("updated_at", new Date(now.getTime() - 7 * 86_400_000).toISOString())
      .gt("id", cursor || "00000000-0000-0000-0000-000000000000").order("id").limit(100);
    if (error) throw new Error("Recovery preview schema/order query failed", { cause: error });
    if (!data?.length) break;
    for (const order of data as RecoveryOrder[]) {
      const touch = recoveryTouchDue(order, now);
      if (!touch || !await getVerifiedResumeDestination(order)) { counts.excluded++; continue; }
      const { data: existing, error: ledgerError } = await supabaseServer.from("recovery_touch_drafts")
        .select("id").eq("order_id", order.id).eq("touch_hours", touch).maybeSingle();
      if (ledgerError) throw new Error("Recovery preview ledger unavailable", { cause: ledgerError });
      if (existing) counts.alreadyDrafted++;
      else counts[touch === 1 ? "hour1" : "hour24"]++;
    }
    cursor = data[data.length - 1].id;
  }
  console.log(JSON.stringify({ mode: "read_only", sendingEnabled: false, ...counts }));
}
void main().catch(() => { console.error("Recovery preview failed; check schema/provider access. No messages sent."); process.exitCode = 1; });
