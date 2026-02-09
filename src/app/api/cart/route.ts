export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "../../../lib/supabase-server";
import { getUserFromRequest } from "../../../lib/get-user-from-request";
import { getPrice } from "../../../lib/pricing/getPrice";

export async function GET(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ hasCart: false });
  }

  const { data: order, error } = await supabaseServer
    .from("orders")
    .select(
      `
      id,
      status,
      rx,
      sku,
      box_count,
      price_per_box_cents,
      total_amount_cents,
      created_at
    `,
    )
    .eq("user_id", user.id)
    .in("status", ["draft", "pending_verification", "pending"])
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  console.log("🟢 [cart GET] DB ORDER (raw)", {
    id: order?.id,
    status: order?.status,
    sku: order?.sku,
    box_count: order?.box_count,
    db_price_per_box_cents: order?.price_per_box_cents,
    db_total_amount_cents: order?.total_amount_cents,
  });

  if (error || !order) {
    return NextResponse.json({ hasCart: false });
  }

  if (!order.rx) {
    return NextResponse.json({ error: "Cart missing RX" }, { status: 400 });
  }

  // Optional UI helper ONLY
  const lens_id =
    order.rx?.right?.lens_id ?? order.rx?.left?.lens_id ?? null;

  // ✅ Derived pricing (authoritative)
  let derived_price_per_box_cents: number | null = null;
  let derived_total_amount_cents: number | null = null;
  let price_reason: string | null = null;

  try {
    if (order.sku && typeof order.box_count === "number" && order.box_count > 0) {
      const pricing = getPrice({ sku: order.sku, box_count: order.box_count });
      derived_price_per_box_cents = pricing.price_per_box_cents;
      derived_total_amount_cents = pricing.total_amount_cents;
      price_reason = pricing.price_reason ?? null;

      console.log("🟢 [cart GET] DERIVED PRICING", {
        sku: order.sku,
        box_count: order.box_count,
        derived_price_per_box_cents,
        derived_total_amount_cents,
        price_reason,
      });
    } else {
      console.log("🟡 [cart GET] SKIP PRICING (missing sku/box_count)", {
        sku: order.sku,
        box_count: order.box_count,
      });
    }
  } catch (e) {
    console.error("🔴 [cart GET] PRICING ERROR (derived)", e);
  }

  // ✅ IMPORTANT:
  // We return derived values in the same fields so UI stops reading stale DB values.
  return NextResponse.json({
    hasCart: true,
    order: {
      id: order.id,
      status: order.status,
      rx: order.rx,
      lens_id, // nullable by design
      sku: order.sku ?? null,
      box_count: order.box_count ?? null,

      // ✅ always derived; never trust DB
      price_per_box_cents: derived_price_per_box_cents,
      total_amount_cents: derived_total_amount_cents,
      price_reason,
    },
  });
}
