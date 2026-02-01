export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "../../../../lib/supabase-server";
import { getUserFromRequest } from "../../../../lib/get-user-from-request";

export async function GET(req: Request) {
  // 1️⃣ Require authenticated user
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ hasItems: false });
  }

  // 2️⃣ Draft or pending order == "has items"
  const { data: orders, error } = await supabaseServer
    .from("orders")
    .select("id")
    .eq("user_id", user.id)
    .in("status", ["draft", "pending"])
    .limit(1);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    hasItems: Boolean(orders && orders.length > 0),
  });
}
