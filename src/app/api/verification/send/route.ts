export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "../../../../lib/supabase-server";
import { getUserFromRequest } from "../../../../lib/get-user-from-request";

export async function POST(req: Request) {
  try {
    /* =========================
       1️⃣ Auth
    ========================= */
    const user = await getUserFromRequest(req);

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    /* =========================
       2️⃣ Load most recent pending order
    ========================= */
    const { data: order, error: orderError } = await supabaseServer
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

    if (orderError || !order) {
      return NextResponse.json(
        { error: "No pending order found" },
        { status: 400 }
      );
    }

    /* =========================
       3️⃣ Prescriber timezone (MVP hardcoded)
    ========================= */
    const prescriberTimeZone = "America/Chicago";
    const nowIso = new Date().toISOString();

    /* =========================
       4️⃣ Calculate passive deadline
    ========================= */
    const { data, error: deadlineError } =
      await supabaseServer.rpc("calculate_passive_deadline", {
        p_start: nowIso,
        p_timezone: prescriberTimeZone,
      });

    if (deadlineError) {
      return NextResponse.json(
        { error: deadlineError.message },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Passive deadline calculation returned null" },
        { status: 500 }
      );
    }

    // Supabase may return scalar or array depending on config
    const passiveDeadline =
      Array.isArray(data) ? data[0] : data;

    if (!passiveDeadline) {
      return NextResponse.json(
        { error: "Passive deadline missing" },
        { status: 500 }
      );
    }

    /* =========================
       5️⃣ Update order
    ========================= */
    const { error: updateError } = await supabaseServer
      .from("orders")
      .update({
        verification_sent_at: nowIso,
        passive_deadline_at: passiveDeadline,
        verification_status: "awaiting_response",
      })
      .eq("id", order.id);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      passive_deadline_at: passiveDeadline,
    });

  } catch (err: unknown) {
    if (err instanceof Error) {
      return NextResponse.json(
        { error: err.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 }
    );
  }
}
