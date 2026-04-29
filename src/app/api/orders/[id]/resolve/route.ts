import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveDefaultSku } from "@/lib/pricing/resolveDefaultSku";
import { getPrice } from "@/lib/pricing/getPrice";
import { getSkuBoxDurationMonths } from "@/lib/pricing/skuDefaults";

const MIN_DAYS_FOR_ANNUAL = 150;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

function daysUntil(expires: string): number {
  const exp = new Date(expires);
  if (isNaN(exp.getTime())) {
    throw new Error("Invalid RX expiration date");
  }
  const now = new Date();
  return Math.floor((exp.getTime() - now.getTime()) / MS_PER_DAY);
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: orderId } = await context.params;
  const supabase = supabaseServer;

  try {
    /* 1️⃣ Load order */
    const { data: order, error } = await supabase
      .from("orders")
      .select("id, coreId, rx, box_count")
      .eq("id", orderId)
      .single();

    if (error || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (!order.coreId) {
      return NextResponse.json(
        { error: "Order missing coreId" },
        { status: 400 }
      );
    }

    if (!order.rx?.expires) {
      return NextResponse.json(
        { error: "Order missing RX expiration" },
        { status: 400 }
      );
    }

    /* 2️⃣ Resolve SKU */
    const sku = resolveDefaultSku(order.coreId);
    if (!sku) {
      return NextResponse.json(
        { error: `No SKU defined for lens ${order.coreId}` },
        { status: 400 }
      );
    }

    /* 3️⃣ RX → allowed supply */
    const daysRemaining = daysUntil(order.rx.expires);
    const targetMonths: 6 | 12 =
      daysRemaining >= MIN_DAYS_FOR_ANNUAL ? 12 : 6;

    /* 4️⃣ Box count */
    const boxDurationMonths = getSkuBoxDurationMonths(sku);
    if (!boxDurationMonths) {
      return NextResponse.json(
        { error: `No duration defined for SKU ${sku}` },
        { status: 500 }
      );
    }

    const defaultBoxCount = Math.ceil(targetMonths / boxDurationMonths);
    const finalBoxCount =
      order.box_count && order.box_count > 0
        ? Math.min(order.box_count, defaultBoxCount)
        : defaultBoxCount;

    /* 5️⃣ Pricing */
    const pricing = getPrice({
      sku,
      box_count: finalBoxCount,
    });

    /* 6️⃣ Persist */
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        sku,
        box_count: finalBoxCount,
        total_amount_cents: pricing.total_amount_cents,
        status: "draft",
      })
      .eq("id", orderId);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      sku,
      box_count: finalBoxCount,
      total_amount_cents: pricing.total_amount_cents,
    });
  } catch (err) {
    console.error("Resolve route crash:", err);
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}