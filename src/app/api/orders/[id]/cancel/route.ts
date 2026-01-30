export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseServer } from "../../../../../lib/supabase-server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: orderId } = await context.params;

  const { data, error } = await supabaseServer
    .from("orders")
    .select("*")
    .eq("id", orderId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const order = data[0];

  if (order.status !== "authorized") {
    return NextResponse.json(
      { error: "Order is not cancellable" },
      { status: 400 },
    );
  }

  if (!order.payment_intent_id) {
    return NextResponse.json(
      { error: "Missing payment_intent_id" },
      { status: 400 },
    );
  }

  await stripe.paymentIntents.cancel(order.payment_intent_id);

  const { error: updateError } = await supabaseServer
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", orderId);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
