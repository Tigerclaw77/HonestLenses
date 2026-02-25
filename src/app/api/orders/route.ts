export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "../../../lib/supabase-server";
import { getUserFromRequest } from "../../../lib/get-user-from-request";

export async function POST(req: Request) {
  try {
    /* =========================
       1️⃣ Auth
    ========================= */
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    /* =========================
       2️⃣ Reuse ONLY a clean draft
       (no Stripe intent attached)
    ========================= */
    const { data: existingDraft, error: existingError } =
      await supabaseServer
        .from("orders")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "draft")
        .is("payment_intent_id", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        { error: existingError.message },
        { status: 500 }
      );
    }

    if (existingDraft?.id) {
      return NextResponse.json({ orderId: existingDraft.id });
    }

    /* =========================
       3️⃣ Otherwise create NEW draft
    ========================= */
    const { data: newOrder, error: insertError } =
      await supabaseServer
        .from("orders")
        .insert({
          user_id: user.id,
          status: "draft",
          currency: "USD",
          box_count: 0,
        })
        .select("id")
        .single();

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    if (!newOrder?.id) {
      return NextResponse.json(
        { error: "Order creation failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({ orderId: newOrder.id });
  } catch {
    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 }
    );
  }
}