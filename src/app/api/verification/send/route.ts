export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "../../../../lib/supabase-server";
import { getUserFromRequest } from "../../../../lib/get-user-from-request";

export async function POST(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1️⃣ Load most recent pending order
  const { data: order, error } = await supabaseServer
    .from("orders")
    .select(`
      id,
      status
    `)
    .eq("user_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !order) {
    return NextResponse.json({ error: "No pending order" }, { status: 400 });
  }

  // 2️⃣ Prescriber timezone (MVP hardcoded)
  const prescriberTimeZone = "America/Chicago";

  const nowIso = new Date().toISOString();

  // 3️⃣ Calculate passive deadline via SQL function
  const { data: passiveDeadline, error: deadlineError } =
    await supabaseServer.rpc("calculate_passive_deadline", {
      start_ts: nowIso,
      tz: prescriberTimeZone,
    });

  if (deadlineError || !passiveDeadline) {
    return NextResponse.json(
      { error: deadlineError?.message || "Deadline calculation failed" },
      { status: 500 }
    );
  }

  // 4️⃣ Update order
  const { error: updateError } = await supabaseServer
    .from("orders")
    .update({
      verification_sent_at: nowIso,
      passive_deadline_at: passiveDeadline,
      verification_status: "awaiting_response",
      status: "pending_verification",
    })
    .eq("id", order.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    passive_deadline_at: passiveDeadline,
  });
}
