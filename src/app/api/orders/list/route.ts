export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "../../../../lib/supabase-server";
import { getUserFromRequest } from "../../../../lib/get-user-from-request";

export async function GET(req: Request) {
  // 1️⃣ Require authenticated user
  const user = await getUserFromRequest(req);

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  // 2️⃣ List only this user's orders
  const { data, error } = await supabaseServer
    .from("orders")
    .select(
      `
      id,
      status,
      total_amount_cents,
      currency,
      verification_required,
      rx_data,
      created_at
      `
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ orders: data });
}
