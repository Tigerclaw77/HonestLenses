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

  const TWO_HOURS_MS = 1000 * 60 * 60 * 2;

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
      created_at,
      payment_intent_id
    `)
    .eq("user_id", user.id)
    .eq("status", "draft")
    .is("payment_intent_id", null)
    .order("created_at", { ascending: false });

  console.log("RAW ORDERS:", orders, error);

  if (error) {
    console.error("CART QUERY ERROR:", error);
    return NextResponse.json({ hasCart: false, order: null });
  }

  if (!orders || orders.length === 0) {
    console.log("NO DRAFT ORDERS FOUND FOR USER:", user.id);
    return NextResponse.json({ hasCart: false, order: null });
  }

  /* =========================
     Filter to RECENT drafts
  ========================= */

  const now = Date.now();

  const recentOrders = orders.filter((o) => {
    if (!o?.created_at) return false;

    const age = now - new Date(o.created_at).getTime();
    return age <= TWO_HOURS_MS;
  });

  console.log("RECENT ORDERS:", recentOrders.map((o) => o.id));

  if (recentOrders.length === 0) {
    console.log("ONLY STALE DRAFTS FOUND — forcing new order");

    return NextResponse.json({
      hasCart: false,
      order: null,
    });
  }

  /* =========================
     Pick FIRST VALID order
  ========================= */

  let validOrder: (typeof recentOrders)[number] | null = null;

  for (const o of recentOrders) {
    if (!o) continue;

    if (!o.rx || !isRxData(o.rx)) continue;
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