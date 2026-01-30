export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "../../../lib/supabase-server";
import { getUserFromRequest } from "../../../lib/get-user-from-request";

export async function POST(req: Request) {
  // 1️⃣ Require authenticated user (via Authorization header)
  const user = await getUserFromRequest(req);

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  // 2️⃣ Create draft order owned by user
  const { data, error } = await supabaseServer
    .from("orders")
    .insert({
      user_id: user.id,
      status: "draft",
      total_amount_cents: 0,
      currency: "USD",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  // 3️⃣ Return order id
  return NextResponse.json({ orderId: data.id });
}
