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

    const TWO_HOURS_MS = 1000 * 60 * 60 * 2;

    /* =========================
       2️⃣ Find RECENT reusable draft
       (no Stripe intent attached)
    ========================= */

    const { data: drafts, error: existingError } =
      await supabaseServer
        .from("orders")
        .select("id, created_at")
        .eq("user_id", user.id)
        .eq("status", "draft")
        .is("payment_intent_id", null)
        .order("created_at", { ascending: false });

    if (existingError) {
      return NextResponse.json(
        { error: existingError.message },
        { status: 500 }
      );
    }

    const now = Date.now();

    const recentDraft = drafts?.find((d) => {
      if (!d?.created_at) return false;
      const age = now - new Date(d.created_at).getTime();
      return age <= TWO_HOURS_MS;
    });

    if (recentDraft?.id) {
      console.log("REUSING RECENT DRAFT:", recentDraft.id);

      return NextResponse.json({ orderId: recentDraft.id });
    }

    console.log("NO RECENT DRAFT — creating new order");

    /* =========================
       3️⃣ Create NEW draft
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

    console.log("CREATED NEW DRAFT:", newOrder.id);

    return NextResponse.json({ orderId: newOrder.id });

  } catch (err) {
    console.error("ORDERS ROUTE ERROR:", err);

    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 }
    );
  }
}