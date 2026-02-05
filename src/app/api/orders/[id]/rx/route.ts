export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "../../../../../lib/supabase-server";
import { getUserFromRequest } from "../../../../../lib/get-user-from-request";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  // ✅ MUST await params in your Next.js version
  const { id: orderId } = await context.params;

  console.log("RX ROUTE HIT", orderId);

  // 1️⃣ Require authenticated user
  const user = await getUserFromRequest(req);
  if (!user) {
    console.error("RX FAIL: unauthenticated");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rx;
  try {
    rx = await req.json();
    console.log("RX BODY RECEIVED:", JSON.stringify(rx, null, 2));
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  // 2️⃣ Verify order ownership
  const { data: order, error: orderError } = await supabaseServer
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .eq("user_id", user.id)
    .single();

  if (orderError || !order) {
    console.error("RX FAIL: order not found or not owned", {
      orderId,
      userId: user.id,
      orderError,
    });

    return NextResponse.json(
      { error: "Order not found or not owned by user" },
      { status: 400 }
    );
  }

  if (order.status !== "draft") {
    return NextResponse.json(
      { error: "Order is not editable" },
      { status: 400 }
    );
  }

  // 3️⃣ Persist RX
  const { error: updateError } = await supabaseServer
    .from("orders")
    .update({
      rx_data: rx,
      verification_status: "pending",
    })
    .eq("id", orderId)
    .eq("user_id", user.id);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 }
    );
  }

  console.log("RX SUCCESS", orderId);

  return NextResponse.json({ ok: true });
}
