export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getUserFromRequest } from "../../../lib/get-user-from-request";
import { supabaseServer } from "@/lib/supabase-server";

/* =========================
   Types
========================= */

type EyeRx = {
  coreId: string;
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
      typeof (v.right as Record<string, unknown>).coreId === "string");

  const leftOk =
    !("left" in v) ||
    (typeof v.left === "object" &&
      v.left !== null &&
      typeof (v.left as Record<string, unknown>).coreId === "string");

  return rightOk && leftOk;
}

/* =========================
   Route
========================= */

export async function GET(req: Request) {
  console.log("CART ROUTE HIT");

  const user = await getUserFromRequest(req);
  console.log("CART USER:", user?.id);

  if (!user) {
    return NextResponse.json({ hasCart: false, order: null });
  }

  /* =========================
     Load ALL draft orders (not maybeSingle)
  ========================= */

  const { data: orders, error } = await supabaseServer
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
    .eq("status", "draft")
    .order("created_at", { ascending: false });

  console.log("RAW ORDERS:", orders, error);

  if (error || !orders || orders.length === 0) {
    return NextResponse.json({ hasCart: false, order: null });
  }

  /* =========================
     Pick FIRST VALID order
  ========================= */

  let validOrder = null;

  for (const o of orders) {
    if (!o) continue;

    // must have RX
    if (!o.rx || !isRxData(o.rx)) continue;

    // must have at least one eye
    if (!o.rx.right && !o.rx.left) continue;

    validOrder = o;
    break;
  }

  if (!validOrder) {
    console.log("NO VALID DRAFT FOUND FOR USER:", user.id);

    return NextResponse.json({
      hasCart: false,
      order: null,
    });
  }

  const coreId =
    validOrder.rx.right?.coreId ??
    validOrder.rx.left?.coreId ??
    null;

  console.log("USING ORDER:", validOrder.id);

  return NextResponse.json({
    hasCart: true,
    order: {
      id: validOrder.id,
      status: validOrder.status,
      rx: validOrder.rx,
      coreId,
      sku: validOrder.sku ?? null,
      box_count: validOrder.box_count ?? null,
      right_box_count: validOrder.right_box_count ?? null,
      left_box_count: validOrder.left_box_count ?? null,
      total_amount_cents: validOrder.total_amount_cents ?? null,
    },
  });
}