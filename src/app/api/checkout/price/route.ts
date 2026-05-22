export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "../../../../lib/supabase-server";
import { getUserFromRequest } from "../../../../lib/get-user-from-request";

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
     2️⃣ Load ACTIVE PENDING order
     (Resolve already priced it)
  ========================= */
  const { data: order, error } = await supabaseServer
    .from("orders")
    .select(`
      id,
      status,
      sku,
      box_count,
      shipping_cents,
      shipping_method,
      total_amount_cents,
      currency
    `)
    .eq("user_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !order) {
    return NextResponse.json(
      { error: "No active pending order" },
      { status: 400 }
    );
  }

  if (!order.sku) {
    return NextResponse.json(
      { error: "Order missing SKU" },
      { status: 400 }
    );
  }

  if (
    typeof order.box_count !== "number" ||
    order.box_count <= 0
  ) {
    return NextResponse.json(
      { error: "Order missing valid box_count" },
      { status: 400 }
    );
  }

  if (
    typeof order.total_amount_cents !== "number" ||
    order.total_amount_cents <= 0
  ) {
    return NextResponse.json(
      { error: "Order missing valid total_amount_cents" },
      { status: 400 }
    );
  }

  console.log("🧾 CHECKOUT ORDER LOADED", {
    id: order.id,
    sku: order.sku,
    box_count: order.box_count,
    shipping_cents: order.shipping_cents ?? null,
    shipping_method: order.shipping_method ?? "standard",
    total_amount_cents: order.total_amount_cents,
  });

  /* =========================
     3️⃣ Return Authoritative Price
     (Stripe will use this)
  ========================= */
  return NextResponse.json({
    ok: true,
    orderId: order.id,
    sku: order.sku,
    box_count: order.box_count,
    total_amount_cents: order.total_amount_cents,
    currency: order.currency ?? "USD",
  });
}
