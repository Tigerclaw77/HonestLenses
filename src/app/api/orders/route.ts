export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "../../../lib/supabase-server";
import { getUserFromRequest } from "../../../lib/get-user-from-request";

export async function POST(req: Request) {
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
     2️⃣ Reuse existing editable order (idempotent)
  ========================= */
  const { data: existingOrders, error: existingError } =
    await supabaseServer
      .from("orders")
      .select("id")
      .eq("user_id", user.id)
      .in("status", ["draft", "pending"])
      .order("created_at", { ascending: false })
      .limit(1);

  if (existingError) {
    return NextResponse.json(
      { error: existingError.message },
      { status: 500 }
    );
  }

  if (existingOrders && existingOrders.length > 0) {
    return NextResponse.json({ orderId: existingOrders[0].id });
  }

  /* =========================
     3️⃣ Create new draft order (minimal, ops-only)
  ========================= */
  const { data: order, error: orderError } =
    await supabaseServer
      .from("orders")
      .insert({
        user_id: user.id,
        status: "draft",
        currency: "USD",
        box_count: 0, // explicit, avoids NULL math later
      })
      .select("id")
      .single();

  if (orderError || !order) {
    return NextResponse.json(
      { error: orderError?.message || "Order creation failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ orderId: order.id });
}