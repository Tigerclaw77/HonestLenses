export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "../../../../../lib/supabase-server";
import { getUserFromRequest } from "../../../../../lib/get-user-from-request";
import { resolveDefaultSku } from "../../../../../lib/pricing/resolveDefaultSku";

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


export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  // ✅ MUST await params in your Next.js version
  const { id: orderId } = await context.params;

  console.log("🟣 [RX] ROUTE HIT", { orderId });

  // 1️⃣ Require authenticated user
  const user = await getUserFromRequest(req);
  if (!user) {
    console.error("🔴 [RX] FAIL: unauthenticated");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2️⃣ Parse RX body
  let rx: RxData;
  try {
    rx = await req.json();
    console.log("🟣 [RX] BODY RECEIVED:", JSON.stringify(rx, null, 2));
  } catch {
    console.error("🔴 [RX] FAIL: invalid JSON");
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  // 3️⃣ Extract lens_id from RX (AUTHORITATIVE RULE)
  const lensId =
    rx?.right?.lens_id ||
    rx?.left?.lens_id ||
    null;

  if (!lensId) {
    console.error("🔴 [RX] FAIL: missing lens_id in RX", rx);
    return NextResponse.json(
      { error: "RX missing lens_id" },
      { status: 400 }
    );
  }

  console.log("🟣 [RX] lens_id extracted:", lensId);

  // 4️⃣ Resolve SKU immediately (THIS IS THE FIX)
  const sku = resolveDefaultSku(lensId);

  if (!sku) {
    console.error("🔴 [RX] FAIL: no default SKU for lens_id", lensId);
    return NextResponse.json(
      { error: `No default SKU for lens_id ${lensId}` },
      { status: 400 }
    );
  }

  console.log("🟣 [RX] SKU resolved:", sku);

  // 5️⃣ Verify order ownership
  const { data: order, error: orderError } = await supabaseServer
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .eq("user_id", user.id)
    .single();

  if (orderError || !order) {
    console.error("🔴 [RX] FAIL: order not found or not owned", {
      orderId,
      userId: user.id,
      orderError,
    });

    return NextResponse.json(
      { error: "Order not found or not owned by user" },
      { status: 400 }
    );
  }

  if (!["draft", "pending"].includes(order.status)) {
    console.error("🔴 [RX] FAIL: order not editable", order.status);
    return NextResponse.json(
      { error: "Order is not editable" },
      { status: 400 }
    );
  }

  // 6️⃣ Persist RX + SKU together (CRITICAL)
  const { error: updateError } = await supabaseServer
    .from("orders")
    .update({
      rx,
      sku,                       // ✅ WRITE SKU HERE
      verification_status: "pending",
      status: "draft",
    })
    .eq("id", orderId)
    .eq("user_id", user.id);

  if (updateError) {
    console.error("🔴 [RX] FAIL: update error", updateError);
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 }
    );
  }

  console.log("🟢 [RX] SUCCESS", { orderId, sku });

  return NextResponse.json({ ok: true });
}
