export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "../../../../../lib/supabase-server";
import { getUserFromRequest } from "../../../../../lib/get-user-from-request";
import { getPrice } from "../../../../../lib/pricing/getPrice";
import { deriveTotalBoxes, deriveTotalMonths } from "../../../../../lib/shipping";
import { resolveShipping } from "../../../../../lib/shipping/resolveShipping";

type OrderRow = {
  id: string;
  user_id: string;
  status: "draft" | "pending" | string;
  sku: string | null;
  total_box_count: number | null;
  box_count: number | null;
  left_box_count: number | null;
  right_box_count: number | null;
  total_amount_cents: number | null;
};

/* ============================================================
   POST /api/orders/[id]/price
============================================================ */

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  /* =========================
     1) Auth
  ========================= */

  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: orderId } = await context.params;

  if (!orderId) {
    return NextResponse.json({ error: "Missing order id" }, { status: 400 });
  }

  /* =========================
     2) Load order
  ========================= */

  const { data: order, error } = await supabaseServer
    .from("orders")
    .select(`
      id,
      user_id,
      status,
      sku,
      total_box_count,
      box_count,
      left_box_count,
      right_box_count,
      total_amount_cents
    `)
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

  if (order.status !== "draft" && order.status !== "pending") {
    return NextResponse.json(
      { error: "Order not priceable in current state" },
      { status: 400 }
    );
  }

  /* =========================
     3) Validate pricing inputs
  ========================= */

  if (!order.sku) {
    return NextResponse.json(
      { error: "Order missing sku (cart not resolved)" },
      { status: 400 }
    );
  }

  const totalBoxes = deriveTotalBoxes(order);

  if (totalBoxes <= 0) {
    return NextResponse.json(
      { error: "Order missing valid box_count" },
      { status: 400 }
    );
  }

  const totalMonths = deriveTotalMonths({
    sku: order.sku,
    totalBoxes,
    left_box_count: order.left_box_count,
    right_box_count: order.right_box_count,
  });

  /* =========================
     4) Price resolution
  ========================= */

  let pricing;
  try {
    pricing = getPrice({
      sku: order.sku,
      box_count: totalBoxes,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Pricing resolution failed",
      },
      { status: 400 }
    );
  }

  const shipping = resolveShipping({
    manufacturer: pricing.manufacturer,
    totalMonths,
    itemCount: totalBoxes,
    hasMixedSkus: false,
  });

  /* =========================
     5) Persist pricing
  ========================= */

  const { error: updateError } = await supabaseServer
    .from("orders")
    .update({
      manufacturer: pricing.manufacturer,
      box_count: totalBoxes,
      total_box_count: totalBoxes,
      shipping_cents: shipping.shippingCents,
      total_amount_cents: pricing.total_amount_cents + shipping.shippingCents,
      price_reason: pricing.price_reason,
    })
    .eq("id", order.id)
    .eq("user_id", user.id);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    total_amount_cents: pricing.total_amount_cents + shipping.shippingCents,
    shipping_cents: shipping.shippingCents,
  });
}
