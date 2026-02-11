export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "../../../lib/supabase-server";
import { getUserFromRequest } from "../../../lib/get-user-from-request";

/* =========================
   Types
========================= */

type EyeRx = {
  lens_id: string;
};

type RxData = {
  right?: EyeRx;
  left?: EyeRx;
};

/* =========================
   Type Guards
========================= */

function isRxData(value: unknown): value is RxData {
  if (typeof value !== "object" || value === null) return false;

  const v = value as Record<string, unknown>;

  const rightOk =
    !("right" in v) ||
    (typeof v.right === "object" &&
      v.right !== null &&
      typeof (v.right as Record<string, unknown>).lens_id === "string");

  const leftOk =
    !("left" in v) ||
    (typeof v.left === "object" &&
      v.left !== null &&
      typeof (v.left as Record<string, unknown>).lens_id === "string");

  return rightOk && leftOk;
}

/* =========================
   Route
========================= */

export async function GET(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ hasCart: false });

  const { data: order, error } = await supabaseServer
    .from("orders")
    .select(`
      id,
      status,
      rx,
      sku,
      box_count,
      right_box_count,
      left_box_count,
      total_amount_cents,
      price_reason,
      created_at
    `)
    .eq("user_id", user.id)
    .in("status", ["draft", "pending", "pending_verification"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !order) {
    return NextResponse.json({ hasCart: false });
  }

  if (!order.rx || !isRxData(order.rx)) {
    return NextResponse.json(
      { error: "Cart missing or invalid RX data" },
      { status: 400 }
    );
  }

  const lens_id =
    order.rx.right?.lens_id ??
    order.rx.left?.lens_id ??
    null;

  return NextResponse.json({
    hasCart: true,
    order: {
      id: order.id,
      status: order.status,
      rx: order.rx,
      lens_id,
      sku: order.sku ?? null,
      box_count: order.box_count ?? null,
      right_box_count: order.right_box_count ?? null,
      left_box_count: order.left_box_count ?? null,
      total_amount_cents: order.total_amount_cents ?? null,
    },
  });
}
