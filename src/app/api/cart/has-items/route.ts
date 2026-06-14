export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "../../../../lib/supabase-server";
import { getOrderAccess, hasOrderAccessContext } from "@/lib/order-access";

export async function GET(req: Request) {
  const access = await getOrderAccess(req);
  if (!hasOrderAccessContext(access)) {
    return NextResponse.json({ hasItems: false });
  }

  let query = supabaseServer
    .from("orders")
    .select("id")
    .in("status", ["draft", "pending"])
    .limit(1);

  if (access.guestOrderId) {
    query = query.eq("id", access.guestOrderId);
  } else if (access.userId) {
    query = query.eq("user_id", access.userId);
  }

  const { data: orders, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    hasItems: Boolean(orders && orders.length > 0),
  });
}
