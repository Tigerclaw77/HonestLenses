export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "../../../../../lib/supabase-server";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: orderId } = await context.params;
  const body = await req.json();

  const { total_amount_cents, currency } = body;

  if (
    typeof total_amount_cents !== "number" ||
    total_amount_cents <= 0
  ) {
    return NextResponse.json(
      { error: "total_amount_cents must be a positive number" },
      { status: 400 },
    );
  }

  if (!currency || typeof currency !== "string") {
    return NextResponse.json(
      { error: "currency is required" },
      { status: 400 },
    );
  }

  // Only allow pricing on draft orders
  const { data, error } = await supabaseServer
    .from("orders")
    .update({
      total_amount_cents,
      currency: currency.toUpperCase(),
    })
    .eq("id", orderId)
    .eq("status", "draft")
    .select("id");

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 },
    );
  }

  if (!data || data.length === 0) {
    return NextResponse.json(
      { error: "Order not found or not in draft state" },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
