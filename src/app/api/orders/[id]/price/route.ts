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

type OrderRow = {
  id: string;
  user_id: string;
  status: "draft" | "pending" | string;
  sku: string | null;
  box_count: number | null;
  total_amount_cents: number | null;
};

export async function POST(req: Request, { params }: RouteParams) {
  /* =========================
     1) Auth
  ========================= */

  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orderId = params.id;
  if (!orderId) {
    return NextResponse.json({ error: "Missing order id" }, { status: 400 });
  }

  /* =========================
     2) Load order
  ========================= */

  const { data: order, error } = await supabaseServer
    .from("orders")
    .select(
      `
        id,
        user_id,
        status,
        sku,
        box_count,
        total_amount_cents
      `,
    )
    .eq("id", orderId)
    .single<OrderRow>();

  if (error || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (order.user_id !== user.id) {
    return NextResponse.json({ error: "Order not owned by user" }, { status: 403 });
  }

  if (order.status !== "draft" && order.status !== "pending") {
    return NextResponse.json(
      { error: "Order not priceable in current state" },
      { status: 400 },
    );
  }

  /* =========================
     3) Guard: already priced
     (authoritative via cart/resolve)
  ========================= */

  if (
    typeof order.total_amount_cents === "number" &&
    order.total_amount_cents > 0
  ) {
    return NextResponse.json({
      ok: true,
      total_amount_cents: order.total_amount_cents,
    });
  }

  /* =========================
     4) Validate pricing inputs
  ========================= */

  if (!order.sku) {
    return NextResponse.json(
      { error: "Order missing sku (cart not resolved)" },
      { status: 400 },
    );
  }

  if (
    typeof order.box_count !== "number" ||
    order.box_count <= 0
  ) {
    return NextResponse.json(
      { error: "Order missing valid box_count" },
      { status: 400 },
    );
  }

  /* =========================
     5) Fallback price resolution
     (should be rare)
  ========================= */

  let pricing;
  try {
    pricing = getPrice({
      sku: order.sku,
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
      { status: 400 },
    );
  }

  /* =========================
     6) Persist fallback pricing
  ========================= */

  const { error: updateError } = await supabaseServer
    .from("orders")
    .update({
      total_amount_cents: pricing.total_amount_cents,
      price_reason: pricing.price_reason,
    })
    .eq("id", order.id)
    .eq("user_id", user.id);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    total_amount_cents: pricing.total_amount_cents,
  });
}
