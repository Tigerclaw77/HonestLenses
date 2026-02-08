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
      rx,
      sku,
      box_count,
      price_per_box_cents,
      total_amount_cents
    `)
    .eq("user_id", user.id)
    .in("status", ["draft", "pending_verification"])
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
    console.log("🟢 [cart GET] RETURNING ORDER", {
  id: order?.id,
  status: order?.status,
  sku: order?.sku,
  box_count: order?.box_count,
  total: order?.total_amount_cents,
});


  // ✅ single authoritative guard
  if (error || !order) {
    return NextResponse.json({ hasCart: false });
  }

  if (!order.rx) {
    return NextResponse.json(
      { error: "Cart missing RX" },
      { status: 400 }
    );
  }

  const rx = order.rx;

  // Optional UI helper ONLY (do not rely on this for pricing)
  const lensId =
    rx?.right?.lens_id ??
    rx?.left?.lens_id ??
    null;

  return NextResponse.json({
    hasCart: true,
    order: {
      id: order.id,
      status: order.status,
      rx,
      lens_id: lensId, // nullable by design
      sku: order.sku ?? null,
      box_count: order.box_count ?? null,
      price_per_box_cents: order.price_per_box_cents ?? null,
      total_amount_cents: order.total_amount_cents ?? null,
    },
  });
}
