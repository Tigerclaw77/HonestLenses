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
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: orderId } = await context.params;

  const { data, error } = await supabaseServer
    .from("orders")
    .select("id, user_id, status, total_amount_cents, currency, payment_intent_id")
    .eq("id", orderId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const order = data;

  // Only allow paying draft orders (your current convention)
  if (order.status !== "draft") {
    return NextResponse.json({ error: "Order is not payable" }, { status: 400 });
  }

  if (
    typeof order.total_amount_cents !== "number" ||
    order.total_amount_cents <= 0
  ) {
    return NextResponse.json(
      { error: "Order total must be greater than 0 before payment" },
      { status: 400 },
    );
  }

  // If you already created a PI for this order, you can reuse it (MVP-friendly)
  if (order.payment_intent_id) {
    const existing = await stripe.paymentIntents.retrieve(order.payment_intent_id);

    // If amount changed since PI creation, you *must* update it
    // (this should be rare if cart is frozen before checkout)
    if (existing.amount !== order.total_amount_cents) {
      const updated = await stripe.paymentIntents.update(order.payment_intent_id, {
        amount: order.total_amount_cents,
      });

      return NextResponse.json({ clientSecret: updated.client_secret });
    }

    return NextResponse.json({ clientSecret: existing.client_secret });
  }

  // Create PI (AUTH ONLY). Do NOT confirm here — client confirms via PaymentElement.
  const paymentIntent = await stripe.paymentIntents.create({
    amount: order.total_amount_cents, // ✅ DB is the authority
    currency: (order.currency ?? "usd").toLowerCase(),
    capture_method: "manual",
    automatic_payment_methods: { enabled: true },
    metadata: { order_id: orderId },
  });

  const { error: updateError } = await supabaseServer
    .from("orders")
    .update({
      payment_intent_id: paymentIntent.id,
      // keep status as "draft" until the client confirms payment successfully
    })
    .eq("id", orderId)
    .eq("user_id", user.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ clientSecret: paymentIntent.client_secret });
}