export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "../../../../../lib/supabase-server";
import { getUserFromRequest } from "../../../../../lib/get-user-from-request";
import { getPrice } from "../../../../../lib/pricing/getPrice";

type RouteParams = {
  params: {
    id: string;
  };
};

export async function POST(req: Request, { params }: RouteParams) {
  /* =========================
     Auth
  ========================= */

  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const orderId = params.id;
  if (!orderId) {
    return NextResponse.json(
      { error: "Missing order id" },
      { status: 400 }
    );
  }

  /* =========================
     Load order (SKU must exist)
  ========================= */

  const { data: order, error } = await supabaseServer
    .from("orders")
    .select(`
      id,
      user_id,
      status,
      lens_sku,
      box_count
    `)
    .eq("id", orderId)
    .single();

  if (error || !order) {
    return NextResponse.json(
      { error: "Order not found" },
      { status: 404 }
    );
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

  if (!order.lens_sku) {
    return NextResponse.json(
      { error: "Order missing lens_sku (cart not resolved)" },
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

  /* =========================
     Price resolution (SKU authoritative)
  ========================= */

  let pricing;
  try {
    pricing = getPrice({
      sku: order.lens_sku,
      box_count: order.box_count,
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
     Persist pricing
  ========================= */

  const { error: updateError } = await supabaseServer
    .from("orders")
    .update({
      total_amount_cents: pricing.total_amount_cents,
      revised_total_amount_cents: null,
      price_reason: pricing.price_reason,
      currency: "USD",
    })
    .eq("id", orderId)
    .eq("user_id", user.id);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    total_amount_cents: pricing.total_amount_cents,
  });
}
