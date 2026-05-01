import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveDefaultSku } from "@/lib/pricing/resolveDefaultSku";
import { getPrice } from "@/lib/pricing/getPrice";
import { getSkuBoxDurationMonths } from "@/lib/pricing/skuDefaults";
import { deriveTotalBoxes, deriveTotalMonths } from "@/lib/shipping";
import { resolveShipping } from "@/lib/shipping/resolveShipping";

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
      .select(
        "id, coreId, rx, box_count, total_box_count, left_box_count, right_box_count"
      )
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
    const monthsPerBox = getSkuBoxDurationMonths(sku);
    if (!monthsPerBox) {
      return NextResponse.json(
        { error: `No duration defined for SKU ${sku}` },
        { status: 500 }
      );
    }

    const defaultBoxCount = Math.ceil(targetMonths / monthsPerBox);
    const finalBoxCount =
      order.box_count && order.box_count > 0
        ? Math.min(order.box_count, defaultBoxCount)
        : defaultBoxCount;
    const totalBoxes = deriveTotalBoxes({
      sku,
      total_box_count: null,
      box_count: finalBoxCount,
      left_box_count: null,
      right_box_count: null,
    });
    const totalMonths = deriveTotalMonths({
      sku,
      totalBoxes,
    });
    /* 5️⃣ Pricing */
    const pricing = getPrice({
      sku,
      box_count: totalBoxes,
    });
    const shipping = resolveShipping({
      manufacturer: pricing.manufacturer,
      totalMonths,
      itemCount: totalBoxes,
      hasMixedSkus: false,
    });

    /* 6️⃣ Persist */
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        sku,
        manufacturer: pricing.manufacturer,
        box_count: totalBoxes,
        total_box_count: totalBoxes,
        shipping_cents: shipping.shippingCents,
        total_amount_cents: pricing.total_amount_cents + shipping.shippingCents,
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
      box_count: totalBoxes,
      total_amount_cents: pricing.total_amount_cents + shipping.shippingCents,
      shipping_cents: shipping.shippingCents,
      totalMonths,
    });
  } catch (err) {
    console.error("Resolve route crash:", err);
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}
