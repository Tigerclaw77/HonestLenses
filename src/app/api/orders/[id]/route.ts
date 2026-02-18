export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "../../../../lib/supabase-server";
import { getUserFromRequest } from "../../../../lib/get-user-from-request";

type OrderRow = {
  id: string;
  status: string;
  total_amount_cents: number | null;
  revised_total_amount_cents: number | null;
  verification_status: string | null;
  price_reason: string | null;
  rx: unknown;  // ← change this
  user_id: string;
};

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  /* =========================
     1) Auth
  ========================= */

  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  /* =========================
     2) Extract params (Next 16 style)
  ========================= */

  const { id: orderId } = await context.params;

  if (!orderId) {
    return NextResponse.json({ error: "Missing order id" }, { status: 400 });
  }

  /* =========================
     3) Load order
  ========================= */

  const { data: order, error } = await supabaseServer
    .from("orders")
    .select(
      `
      id,
      status,
      total_amount_cents,
      revised_total_amount_cents,
      verification_status,
      price_reason,
      rx,
      user_id
    `
    )
    .eq("id", orderId)
    .single<OrderRow>();

  if (error || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (order.user_id !== user.id) {
    return NextResponse.json(
      { error: "Order not owned by user" },
      { status: 403 }
    );
  }

  return NextResponse.json({
    order: {
      id: order.id,
      status: order.status,
      total_amount_cents: order.total_amount_cents,
      revised_total_amount_cents: order.revised_total_amount_cents,
      verification_status: order.verification_status,
      price_reason: order.price_reason,
      rx: order.rx,
    },
  });
}
