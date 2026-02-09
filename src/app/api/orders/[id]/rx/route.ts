export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "../../../../../lib/supabase-server";
import { getUserFromRequest } from "../../../../../lib/get-user-from-request";
import { resolveDefaultSku } from "../../../../../lib/pricing/resolveDefaultSku";

/* =========================
   Types
========================= */

type EyeRx = {
  lens_id: string;
  sphere: number;
  cylinder?: number;
  axis?: number;
  add?: string;
  base_curve?: number;
  color?: string;
};

type RxData = {
  expires: string;
  right?: EyeRx;
  left?: EyeRx;
};

/* =========================
   POST /api/orders/:id/rx
   RESPONSIBILITY:
   - Validate RX
   - Resolve SKU from RX
   - Persist RX + SKU ONLY
   - ❌ NO PRICING
   - ❌ NO BOX COUNTS
========================= */

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  /* =========================
     0️⃣ Params
  ========================= */
  const { id: orderId } = await context.params;
  console.log("🟣 [RX] ROUTE HIT", { orderId });

  /* =========================
     1️⃣ Auth
  ========================= */
  const user = await getUserFromRequest(req);
  if (!user) {
    console.error("🔴 [RX] UNAUTHORIZED");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  /* =========================
     2️⃣ Parse RX payload
  ========================= */
  let rx: RxData;
  try {
    rx = (await req.json()) as RxData;
    console.log("🟣 [RX] BODY RECEIVED", JSON.stringify(rx, null, 2));
  } catch {
    console.error("🔴 [RX] INVALID JSON");
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  /* =========================
     3️⃣ Extract lens_id (AUTHORITATIVE)
  ========================= */
  const lens_id: string | null = rx?.right?.lens_id ?? rx?.left?.lens_id ?? null;

  if (!lens_id) {
    console.error("🔴 [RX] MISSING lens_id", rx);
    return NextResponse.json({ error: "RX missing lens_id" }, { status: 400 });
  }

  console.log("🟣 [RX] lens_id extracted:", lens_id);

  /* =========================
     4️⃣ Resolve SKU (RX → SKU)
  ========================= */
  const sku = resolveDefaultSku(lens_id);

  if (!sku) {
    console.error("🔴 [RX] NO SKU FOR lens_id", lens_id);
    return NextResponse.json(
      { error: `No default SKU configured for lens_id ${lens_id}` },
      { status: 400 },
    );
  }

  console.log("🟣 [RX] SKU resolved:", sku);

  /* =========================
     5️⃣ Verify order ownership
  ========================= */
  const { data: order, error: orderError } = await supabaseServer
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .eq("user_id", user.id)
    .single();

  if (orderError || !order) {
    console.error("🔴 [RX] ORDER NOT FOUND / NOT OWNED", {
      orderId,
      userId: user.id,
      orderError,
    });
    return NextResponse.json(
      { error: "Order not found or not owned by user" },
      { status: 400 },
    );
  }

  if (!["draft", "pending"].includes(order.status)) {
    console.error("🔴 [RX] ORDER NOT EDITABLE", order.status);
    return NextResponse.json({ error: "Order is not editable" }, { status: 400 });
  }

  /* =========================
     6️⃣ Persist RX + SKU ONLY
  ========================= */
  console.log("🟣 [RX] UPDATING ORDER (RX + SKU only)", { orderId, sku });

  const { error: updateError } = await supabaseServer
    .from("orders")
    .update({
      rx,
      sku,
      verification_status: "pending",
      status: "draft",
    })
    .eq("id", orderId)
    .eq("user_id", user.id);

  if (updateError) {
    console.error("🔴 [RX] UPDATE FAILED", updateError);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  console.log("🟢 [RX] SUCCESS", { orderId, sku });
  return NextResponse.json({ ok: true, orderId, sku });
}
