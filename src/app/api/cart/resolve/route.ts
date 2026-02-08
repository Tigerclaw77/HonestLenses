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
  if (Number.isNaN(d.getTime())) return NaN;
  return Math.floor((d.getTime() - Date.now()) / MS_PER_DAY);
}

export async function POST(req: Request) {
  console.log("🟥 [cart/resolve] HIT");

  /* =========================
     1️⃣ Auth
  ========================= */
  const user = await getUserFromRequest(req);
  console.log("🟥 [cart/resolve] USER", user?.id ?? "NONE");

  if (!user) {
    console.error("🔴 [cart/resolve] UNAUTHORIZED");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  /* =========================
     2️⃣ Optional body
  ========================= */
  let requestedBoxCount: number | null = null;

  try {
    const body = await req.json();
    console.log("🟥 [cart/resolve] BODY", body);

    if (typeof body?.box_count === "number" && body.box_count > 0) {
      requestedBoxCount = Math.floor(body.box_count);
    }
  } catch {
    console.log("🟡 [cart/resolve] NO BODY (OK)");
  }

  /* =========================
     3️⃣ Load active order
  ========================= */
  const { data: order, error } = await supabaseServer
    .from("orders")
    .select(`
      id,
      user_id,
      status,
      rx,
      sku,
      box_count,
      price_per_box_cents,
      total_amount_cents,
      created_at
    `)
    .eq("user_id", user.id)
    .in("status", ["draft", "pending", "pending_verification"])
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  console.log("🟥 [cart/resolve] ORDER QUERY RESULT", { error, order });

  if (error || !order) {
    console.error("🔴 [cart/resolve] NO ACTIVE ORDER");
    return NextResponse.json({ error: "No active cart order" }, { status: 400 });
  }

  /* =========================
     4️⃣ RX validation
  ========================= */
  const rx = order.rx ?? null;
  const expires = rx?.expires;

  if (!expires) {
    console.error("🔴 [cart/resolve] RX MISSING EXPIRES", rx);
    return NextResponse.json(
      { error: "Order missing RX expiration" },
      { status: 400 }
    );
  }

  const lensId: string | null =
    rx?.right?.lens_id || rx?.left?.lens_id || null;

  console.log("🟥 [cart/resolve] LENS ID", lensId);

  if (!lensId) {
    console.error("🔴 [cart/resolve] RX MISSING LENS_ID", rx);
    return NextResponse.json(
      { error: "RX missing lens_id" },
      { status: 400 }
    );
  }

  /* =========================
     5️⃣ SKU resolution
  ========================= */
  const sku = order.sku ?? resolveDefaultSku(lensId);

  console.log("🟥 [cart/resolve] SKU RESOLUTION", {
    existing: order.sku,
    resolved: sku,
  });

  if (!sku) {
    console.error("🔴 [cart/resolve] SKU NOT FOUND", lensId);
    return NextResponse.json(
      { error: `No SKU configured for lens_id ${lensId}` },
      { status: 400 }
    );
  }

  /* =========================
     6️⃣ RX duration logic
  ========================= */
  const daysRemaining = daysUntil(expires);
  console.log("🟥 [cart/resolve] DAYS REMAINING", daysRemaining);

  if (!Number.isFinite(daysRemaining)) {
    return NextResponse.json(
      { error: "Invalid RX expiration date" },
      { status: 400 }
    );
  }

  const targetMonths: 6 | 12 =
    daysRemaining >= MIN_DAYS_FOR_ANNUAL ? 12 : 6;

  /* =========================
     7️⃣ Box count resolution
  ========================= */
  const boxDurationMonths = SKU_BOX_DURATION_MONTHS[sku];
  console.log("🟥 [cart/resolve] SKU DURATION (months/box)", boxDurationMonths);

  if (!boxDurationMonths) {
    console.error("🔴 [cart/resolve] SKU DURATION MISSING", sku);
    return NextResponse.json(
      { error: `No duration defined for SKU ${sku}` },
      { status: 500 }
    );
  }

  const maxAllowedBoxCount = Math.ceil(
    targetMonths / boxDurationMonths
  );

  const finalBoxCount = requestedBoxCount
    ? Math.min(requestedBoxCount, maxAllowedBoxCount)
    : maxAllowedBoxCount;

  console.log("🟥 [cart/resolve] BOX COUNT RESOLVED", {
    requestedBoxCount,
    maxAllowedBoxCount,
    finalBoxCount,
  });

  /* =========================
     8️⃣ Pricing
  ========================= */
  let pricing;
  try {
    pricing = getPrice({ sku, box_count: finalBoxCount });
    console.log("🟥 [cart/resolve] PRICING RESULT", pricing);
  } catch (err) {
    console.error("🔴 [cart/resolve] PRICING ERROR", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Pricing failed" },
      { status: 400 }
    );
  }

  /* =========================
     9️⃣ Persist update
  ========================= */
  console.log("🟥 [cart/resolve] UPDATING ORDER", {
    order_id: order.id,
    user_id: user.id,
    sku,
    finalBoxCount,
  });

  const { data: updated, error: updateError } = await supabaseServer
    .from("orders")
    .update({
      sku,
      box_count: finalBoxCount,
      price_per_box_cents: pricing.price_per_box_cents,
      total_amount_cents: pricing.total_amount_cents,
    })
    .eq("id", order.id)
    .eq("user_id", user.id)
    .select();

  console.log("🟥 [cart/resolve] UPDATE RESULT", {
    updated,
    updateError,
  });

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    order_id: order.id,
    sku,
    box_count: finalBoxCount,
    price_per_box_cents: pricing.price_per_box_cents,
    total_amount_cents: pricing.total_amount_cents,
  });
}
