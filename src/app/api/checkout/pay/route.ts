export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseServer } from "../../../../lib/supabase-server";
import { getUserFromRequest } from "../../../../lib/get-user-from-request";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  // DO NOT pin apiVersion — avoids TS + Stripe mismatch issues
});

export async function POST(req: Request) {
  // 1️⃣ Auth
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2️⃣ Load draft order ONLY
  const { data: order, error } = await supabaseServer
    .from("orders")
    .select(
      `
      id,
      user_id,
      status,
      total_amount_cents,
      stripe_payment_intent_id
    `
    )
    .eq("user_id", user.id)
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !order) {
    return NextResponse.json({ error: "No draft order" }, { status: 400 });
  }

  if (
    typeof order.total_amount_cents !== "number" ||
    order.total_amount_cents <= 0
  ) {
    return NextResponse.json(
      { error: "Order missing valid price" },
      { status: 400 }
    );
  }

  // 3️⃣ Reuse existing PaymentIntent if present
  if (order.stripe_payment_intent_id) {
    const existing = await stripe.paymentIntents.retrieve(
      order.stripe_payment_intent_id
    );

    if (!existing.client_secret) {
      return NextResponse.json(
        { error: "Stripe intent missing client secret" },
        { status: 400 }
      );
    }

    return NextResponse.json({ clientSecret: existing.client_secret });
  }

  // 4️⃣ Create Stripe PaymentIntent (manual capture)
  const intent = await stripe.paymentIntents.create({
    amount: order.total_amount_cents,
    currency: "usd",
    capture_method: "manual",
    metadata: {
      order_id: order.id,
      user_id: user.id,
    },
  });

  if (!intent.client_secret) {
    return NextResponse.json(
      { error: "Stripe intent missing client secret" },
      { status: 400 }
    );
  }

  // 5️⃣ Persist Stripe intent ONLY (DO NOT change order.status here)
  const { error: updateError } = await supabaseServer
    .from("orders")
    .update({
      stripe_payment_intent_id: intent.id,
    })
    .eq("id", order.id)
    .eq("user_id", user.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ clientSecret: intent.client_secret });
}
