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
      console.log("🔴 [ORDERS POST] Unauthorized request");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("🟣 [ORDERS POST] user.id =", user.id);
    console.log("🟣 [ORDERS POST] SUPABASE URL =", process.env.NEXT_PUBLIC_SUPABASE_URL);

    /* =========================
       2️⃣ Check for existing draft
    ========================= */
    const { data: existingOrders, error: existingError } =
      await supabaseServer
        .from("orders")
        .select("id, user_id, status, created_at")
        .eq("user_id", user.id)
        .in("status", ["draft", "pending"])
        .order("created_at", { ascending: false })
        .limit(1);

    if (existingError) {
      console.error("🔴 [ORDERS POST] existing lookup error:", existingError);
      return NextResponse.json(
        { error: existingError.message },
        { status: 500 }
      );
    }

    if (existingOrders && existingOrders.length > 0) {
      console.log(
        "🟢 [ORDERS POST] Reusing existing order:",
        existingOrders[0]
      );

      return NextResponse.json({ orderId: existingOrders[0].id });
    }

    /* =========================
       3️⃣ Insert new draft
    ========================= */
    const { data: order, error: orderError } =
      await supabaseServer
        .from("orders")
        .insert({
          user_id: user.id,
          status: "draft",
          currency: "USD",
          box_count: 0,
        })
        .select("id, user_id, status, created_at")
        .single();

    if (orderError) {
      console.error("🔴 [ORDERS POST] insert error:", orderError);
      return NextResponse.json(
        { error: orderError.message },
        { status: 500 }
      );
    }

    if (!order) {
      console.error("🔴 [ORDERS POST] insert returned null order");
      return NextResponse.json(
        { error: "Order creation failed (null result)" },
        { status: 500 }
      );
    }

    console.log("🟢 [ORDERS POST] Created order:", order);

    return NextResponse.json({ orderId: order.id });
  } catch (err) {
    console.error("🔴 [ORDERS POST] Unexpected error:", err);
    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 }
    );
  }
}