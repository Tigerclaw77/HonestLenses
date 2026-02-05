export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "../../../lib/supabase-server";
import { getUserFromRequest } from "../../../lib/get-user-from-request";

export async function GET(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ hasCart: false });
  }

  const { data: order, error } = await supabaseServer
    .from("orders")
    .select(`
      id,
      status,
      rx_data,
      box_count
    `)
    .eq("user_id", user.id)
    .in("status", ["draft", "pending"])
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !order) {
    return NextResponse.json({ hasCart: false });
  }

  const rx = order.rx_data ?? null;

  const lensId =
    rx?.right?.lens_id ||
    rx?.left?.lens_id ||
    null;

  return NextResponse.json({
    hasCart: true,
    order: {
      id: order.id,
      rx,
      lens_id: lensId,
      box_count: order.box_count,
    },
  });
}
