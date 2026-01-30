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

  // 2️⃣ Load order (must belong to user)
  const { data } = await supabaseServer
    .from("orders")
    .select(
      "id, user_id, status, payment_intent_id, verification_status"
    )
    .eq("id", orderId)
    .eq("user_id", user.id);

  if (!data || data.length === 0) {
    return NextResponse.json(
      { error: "Order not found" },
      { status: 404 }
    );
  }

  const order = data[0];

  // 3️⃣ Enforce state
  if (order.status !== "authorized") {
    return NextResponse.json(
      { error: "Order is not capturable" },
      { status: 400 }
    );
  }

  if (!order.payment_intent_id) {
    return NextResponse.json(
      { error: "Missing payment_intent_id" },
      { status: 400 }
    );
  }

  if (!["verified", "altered"].includes(order.verification_status)) {
    return NextResponse.json(
      { error: "Prescription not verified" },
      { status: 400 }
    );
  }

  // 4️⃣ Capture PaymentIntent
  try {
    await stripe.paymentIntents.capture(order.payment_intent_id);
  } catch (err: unknown) {
    if (err instanceof Stripe.errors.StripeError) {
      return NextResponse.json(
        { error: err.message },
        { status: 400 }
      );
    }
    throw err;
  }

  // 5️⃣ Advance order state
  const { error: updateError } = await supabaseServer
    .from("orders")
    .update({
      status: "captured",
    })
    .eq("id", orderId)
    .eq("user_id", user.id);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
