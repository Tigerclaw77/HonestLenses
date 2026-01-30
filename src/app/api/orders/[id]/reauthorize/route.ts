export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseServer } from "../../../../../lib/supabase-server";
import { getUserFromRequest } from "../../../../../lib/get-user-from-request";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  // 1️⃣ Require authenticated user
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { id: orderId } = await context.params;

  // 2️⃣ Load order
  const { data: order, error: orderError } = await supabaseServer
    .from("orders")
    .select(`
      id,
      user_id,
      verification_status,
      total_amount_cents,
      revised_total_amount_cents,
      currency,
      payment_intent_id
    `)
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    return NextResponse.json(
      { error: "Order not found" },
      { status: 404 }
    );
  }

  // 3️⃣ Ownership check (customer action)
  if (order.user_id !== user.id) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403 }
    );
  }

  // 4️⃣ Ensure order actually requires reauth
  if (
    order.verification_status !== "altered" ||
    order.revised_total_amount_cents === null
  ) {
    return NextResponse.json(
      { error: "Order does not require reauthorization" },
      { status: 400 }
    );
  }

  // 5️⃣ Create NEW PaymentIntent (authorize only)
  const intent = await stripe.paymentIntents.create({
    amount: order.revised_total_amount_cents,
    currency: order.currency.toLowerCase(),
    capture_method: "manual",
    metadata: {
      order_id: order.id,
      type: "reauthorization",
    },
  });

  // 6️⃣ Persist new intent on order
  const { error: updateError } = await supabaseServer
    .from("orders")
    .update({
      payment_intent_id: intent.id,
      updated_at: new Date().toISOString(),
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
    clientSecret: intent.client_secret,
  });
}
