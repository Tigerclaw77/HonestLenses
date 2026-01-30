export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseServer } from "../../../../../lib/supabase-server";
import { getUserFromRequest } from "../../../../../lib/get-user-from-request";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  // 1️⃣ Require authenticated user
  const user = await getUserFromRequest(req);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ✅ FIX: params must be awaited
  const { id: orderId } = await context.params;

  // 🔎 Load order (must belong to user)
  const { data, error } = await supabaseServer
    .from("orders")
    .select("id, user_id, status, total_amount_cents, currency")
    .eq("id", orderId)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const order = data[0];

  // 2️⃣ Enforce state
  if (order.status !== "draft") {
    return NextResponse.json(
      { error: "Order is not payable" },
      { status: 400 },
    );
  }

  // 🚫 Guard: Stripe cannot authorize $0
  if (order.total_amount_cents <= 0) {
    return NextResponse.json(
      { error: "Order total must be greater than 0 before payment" },
      { status: 400 },
    );
  }

  // 2️⃣ Create Stripe PaymentIntent (AUTHORIZE ONLY)
  //   const paymentIntent = await stripe.paymentIntents.create({
  //     amount: order.total_amount_cents,
  //     currency: order.currency.toLowerCase(),
  //     capture_method: "manual",
  //     metadata: {
  //       order_id: orderId,
  //     },
  //   });

  // 3️⃣ Create Stripe PaymentIntent (AUTHORIZE ONLY)
  const paymentIntent = await stripe.paymentIntents.create({
    amount: order.total_amount_cents,
    currency: order.currency.toLowerCase(),
    capture_method: "manual",
    payment_method_types: ["card"],
    confirm: true,
    payment_method: "pm_card_visa",
    metadata: {
      order_id: orderId,
    },
  });

  // 4️⃣ Persist Stripe ID + advance order state
  const { error: updateError } = await supabaseServer
    .from("orders")
    .update({
      payment_intent_id: paymentIntent.id,
      status: "authorized",
    })
    .eq("id", orderId)
    .eq("user_id", user.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // 5️⃣ Return client secret
  return NextResponse.json({
    clientSecret: paymentIntent.client_secret,
  });
}
