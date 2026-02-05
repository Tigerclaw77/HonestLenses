export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "../../../../lib/supabase-server";
import { getUserFromRequest } from "../../../../lib/get-user-from-request";
import { resolveDefaultSku } from "../../../../lib/pricing/resolveDefaultSku";
import { SKU_BOX_DURATION_MONTHS } from "../../../../lib/pricing/skuDefaults";
import { getPrice } from "../../../../lib/pricing/getPrice";

/**
 * RX rule (MVP):
 * ≥ 5 months remaining → allow 12-month supply
 * < 5 months remaining → cap at 6-month supply
 */
const MIN_DAYS_FOR_ANNUAL = 150;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

function daysUntil(expires: string): number {
  const d = new Date(expires);
  if (isNaN(d.getTime())) {
    throw new Error("Invalid RX expiration date");
  }
  const now = new Date();
  return Math.floor((d.getTime() - now.getTime()) / MS_PER_DAY);
}

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

  const body = await req.json();
  const requestedBoxCount: number | null =
    typeof body.box_count === "number" && body.box_count > 0
      ? body.box_count
      : null;

  /* =========================
     2️⃣ Load active cart order
  ========================= */

  const { data: order, error } = await supabaseServer
    .from("orders")
    .select("id, lens_id, rx, box_count")
    .eq("user_id", user.id)
    .in("status", ["draft", "cart"])
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !order) {
    return NextResponse.json(
      { error: "No active cart order" },
      { status: 400 }
    );
  }

  if (!order.lens_id) {
    return NextResponse.json(
      { error: "Order missing lens_id" },
      { status: 400 }
    );
  }

  if (!order.rx?.expires) {
    return NextResponse.json(
      { error: "Order missing RX expiration" },
      { status: 400 }
    );
  }

  /* =========================
     3️⃣ Resolve physical SKU
  ========================= */

  const sku = resolveDefaultSku(order.lens_id);
  if (!sku) {
    return NextResponse.json(
      { error: `No SKU configured for lens ${order.lens_id}` },
      { status: 400 }
    );
  }

  /* =========================
     4️⃣ RX → allowed duration
  ========================= */

  let targetMonths: 6 | 12;
  try {
    const daysRemaining = daysUntil(order.rx.expires);
    targetMonths =
      daysRemaining >= MIN_DAYS_FOR_ANNUAL ? 12 : 6;
  } catch {
    return NextResponse.json(
      { error: "Invalid RX expiration date" },
      { status: 400 }
    );
  }

  /* =========================
     5️⃣ Duration → max box_count
  ========================= */

  const boxDurationMonths = SKU_BOX_DURATION_MONTHS[sku];
  if (!boxDurationMonths) {
    return NextResponse.json(
      { error: `No duration defined for SKU ${sku}` },
      { status: 500 }
    );
  }

  const maxAllowedBoxCount = Math.ceil(
    targetMonths / boxDurationMonths
  );

  /**
   * Final quantity:
   * - user-selected (if provided)
   * - capped by RX allowance
   * - otherwise default to max allowed
   */
  const finalBoxCount = requestedBoxCount
    ? Math.min(requestedBoxCount, maxAllowedBoxCount)
    : maxAllowedBoxCount;

  /* =========================
     6️⃣ Pricing
  ========================= */

  const pricing = getPrice({
    sku,
    box_count: finalBoxCount,
  });

  /* =========================
     7️⃣ Persist resolved cart
  ========================= */

  const { error: updateError } = await supabaseServer
    .from("orders")
    .update({
      sku,
      box_count: finalBoxCount,
      total_amount_cents: pricing.total_amount_cents,
      status: "checkout_ready",
    })
    .eq("id", order.id)
    .eq("user_id", user.id);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to resolve cart" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    sku,
    box_count: finalBoxCount,
    total_amount_cents: pricing.total_amount_cents,
  });
}
