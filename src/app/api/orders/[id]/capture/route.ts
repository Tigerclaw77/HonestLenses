export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseServer } from "../../../../../lib/supabase-server";
import { getUserFromRequest } from "../../../../../lib/get-user-from-request";
import { getCaptureAmountCents } from "@/lib/payments/captureAmount";

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
      "id, user_id, status, payment_intent_id, verification_status, total_amount_cents, capture_amount_cents"
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
  let amountToCapture: number;
  try {
    amountToCapture = getCaptureAmountCents(order);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Order capture amount is invalid",
      },
      { status: 400 }
    );
  }

  try {
    const intent = await stripe.paymentIntents.retrieve(order.payment_intent_id);

    if (intent.status === "requires_capture") {
      await stripe.paymentIntents.capture(order.payment_intent_id, {
        amount_to_capture: amountToCapture,
      });
    } else if (intent.status !== "succeeded") {
      return NextResponse.json(
        { error: `PaymentIntent is not capturable (status: ${intent.status})` },
        { status: 400 }
      );
    }
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
  const { data: updatedOrder, error: updateError } = await supabaseServer
    .from("orders")
    .update({
      status: "captured",
    })
    .eq("id", orderId)
    .eq("user_id", user.id)
    .eq("payment_intent_id", order.payment_intent_id)
    .select("id")
    .maybeSingle();

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 }
    );
  }

  if (!updatedOrder) {
    return NextResponse.json(
      { error: "Order state update did not match any rows" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
