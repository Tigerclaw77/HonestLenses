export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "../../../../../lib/supabase-server";
import { getUserFromRequest } from "../../../../../lib/get-user-from-request";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  // 1️⃣ Require authenticated user
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { id: orderId } = await context.params;
  const body = await req.json();

  // 2️⃣ Attach Rx + mark verification pending (ownership enforced)
  const { data, error } = await supabaseServer
    .from("orders")
    .update({
      rx_data: body,
      verification_status: "pending",
    })
    .eq("id", orderId)
    .eq("user_id", user.id)
    .select("id");

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  if (!data || data.length === 0) {
    return NextResponse.json(
      { error: "Order not found or not owned by user" },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true });
}
