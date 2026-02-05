export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "../../../../lib/supabase-server";
import { getUserFromRequest } from "../../../../lib/get-user-from-request";
import { getPrice } from "../../../../lib/pricing/getPrice";

export async function POST(req: Request) {
  // 1️⃣ Auth
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  // 2️⃣ Load active draft order ONLY
  const { data: order, error } = await supabaseServer
    .from("orders")
    .select(`
      id,
      status,
      lens_sku,
      box_count
    `)
    .eq("user_id", user.id)
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !order) {
    return NextResponse.json(
      { error: "No active draft order" },
      { status: 400 }
    );
  }

  if (!order.lens_sku) {
    return NextResponse.json(
      { error: "Order missing lens_sku" },
      { status: 400 }
    );
  }

  if (typeof order.box_count !== "number" || order.box_count <= 0) {
    return NextResponse.json(
      { error: "Order missing valid box_count" },
      { status: 400 }
    );
  }

  // 3️⃣ Price resolution (SKU is authoritative)
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
            : "Pricing failed",
      },
      { status: 400 }
    );
  }

  // 4️⃣ Persist price
  const { error: updateError } = await supabaseServer
    .from("orders")
    .update({
      total_amount_cents: pricing.total_amount_cents,
      currency: "USD",
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
    total_amount_cents: pricing.total_amount_cents,
    price_reason: pricing.price_reason,
  });
}
