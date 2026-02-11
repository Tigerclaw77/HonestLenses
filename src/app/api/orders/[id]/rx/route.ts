export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "../../../../../lib/supabase-server";
import { getUserFromRequest } from "../../../../../lib/get-user-from-request";
import { resolveDefaultSku } from "../../../../../lib/pricing/resolveDefaultSku";
import { lenses } from "../../../../../data/lenses";
import { getColorOptions } from "../../../../../data/lensColors";

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
   Helpers
========================= */

function sanitizeEyeRx(eye: EyeRx | undefined): EyeRx | undefined {
  if (!eye) return undefined;

  const lens = lenses.find((l) => l.lens_id === eye.lens_id);
  if (!lens) return eye;

  const allowedColors = getColorOptions(lens.name);

  // Shallow clone so we never mutate caller data
  const clean: EyeRx = { ...eye };

  // ❌ Strip color if lens does not support it
  if (!allowedColors.length) {
    delete clean.color;
  } else if (clean.color && !allowedColors.includes(clean.color)) {
    delete clean.color;
  }

  return clean;
}

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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  /* =========================
     2️⃣ Parse RX payload
  ========================= */
  let rx: RxData;
  try {
    rx = (await req.json()) as RxData;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  /* =========================
     3️⃣ Extract lens_id (AUTHORITATIVE)
  ========================= */
  const lens_id =
    rx?.right?.lens_id ??
    rx?.left?.lens_id ??
    null;

  if (!lens_id) {
    return NextResponse.json(
      { error: "RX missing lens_id" },
      { status: 400 },
    );
  }

  /* =========================
     4️⃣ Resolve SKU (RX → SKU)
  ========================= */
  const sku = resolveDefaultSku(lens_id);

  if (!sku) {
    return NextResponse.json(
      { error: `No default SKU configured for lens_id ${lens_id}` },
      { status: 400 },
    );
  }

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
    return NextResponse.json(
      { error: "Order not found or not owned by user" },
      { status: 400 },
    );
  }

  if (!["draft", "pending"].includes(order.status)) {
    return NextResponse.json(
      { error: "Order is not editable" },
      { status: 400 },
    );
  }

  /* =========================
     6️⃣ Sanitize RX (SERVER AUTHORITATIVE)
  ========================= */
  const sanitizedRx: RxData = {
    expires: rx.expires,
    right: sanitizeEyeRx(rx.right),
    left: sanitizeEyeRx(rx.left),
  };

  /* =========================
     7️⃣ Persist RX + SKU ONLY
  ========================= */
  const { error: updateError } = await supabaseServer
    .from("orders")
    .update({
      rx: sanitizedRx,
      sku,
      verification_status: "pending",
      status: "draft",
    })
    .eq("id", orderId)
    .eq("user_id", user.id);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    orderId,
    sku,
  });
}
