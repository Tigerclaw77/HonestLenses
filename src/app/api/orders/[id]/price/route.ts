export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "../../../../../lib/supabase-server";
import { type ShippingMethod } from "../../../../../lib/shipping/resolveShipping";
import { getAuthoritativeOrderQuote } from "@/lib/orders/orderPricing";
import { getAuthoritativeOrderQuantity } from "@/lib/orders/orderQuantity";
import {
  canAccessOrder,
  getOrderAccess,
  hasOrderAccessContext,
} from "@/lib/order-access";

type OrderRow = {
  id: string;
  user_id: string | null;
  status: "draft" | "pending" | string;
  sku: string | null;
  total_box_count: number | null;
  box_count: number | null;
  left_box_count: number | null;
  right_box_count: number | null;
  adjusted_total_box_count: number | null;
  adjusted_left_box_count: number | null;
  adjusted_right_box_count: number | null;
  shipping_method: ShippingMethod | null;
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

  const access = await getOrderAccess(request);
  if (!hasOrderAccessContext(access)) {
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
      adjusted_total_box_count,
      adjusted_left_box_count,
      adjusted_right_box_count,
      shipping_method,
      total_amount_cents
    `)
    .eq("id", orderId)
    .single<OrderRow>();

  if (error || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (!canAccessOrder(access, order)) {
    return NextResponse.json(
      { error: "Order not authorized" },
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

  const quantities = getAuthoritativeOrderQuantity(order);
  const totalBoxes = quantities.total;

  if (totalBoxes <= 0) {
    return NextResponse.json(
      { error: "Order missing valid box_count" },
      { status: 400 }
    );
  }

  /* =========================
     4) Price resolution
  ========================= */

  let quote;
  try {
    quote = getAuthoritativeOrderQuote({
      sku: order.sku,
      totalBoxes,
      rightBoxCount: quantities.adjusted
        ? quantities.right
        : order.right_box_count,
      leftBoxCount: quantities.adjusted
        ? quantities.left
        : order.left_box_count,
      shippingMethod: order.shipping_method,
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

  /* =========================
     5) Persist pricing
  ========================= */

  const { error: updateError } = await supabaseServer
    .from("orders")
    .update({
      manufacturer: quote.manufacturer,
      ...(quantities.adjusted
        ? {}
        : { box_count: totalBoxes, total_box_count: totalBoxes }),
      shipping_method: quote.shippingMethod,
      shipping_cents: quote.shippingCents,
      total_amount_cents: quote.totalAmountCents,
      price_reason: quote.priceReason,
    })
    .eq("id", order.id);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    total_amount_cents: quote.totalAmountCents,
    shipping_cents: quote.shippingCents,
    shipping_method: quote.shippingMethod,
  });
}
