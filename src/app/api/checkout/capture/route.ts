export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseServer } from "../../../../lib/supabase-server";
import { getUserFromRequest } from "../../../../lib/get-user-from-request";
import { getCaptureAmountCents } from "@/lib/payments/captureAmount";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  // 1️⃣ Auth
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2️⃣ Load pending order
  const { data: order, error } = await supabaseServer
    .from("orders")
    .select(`
      id,
      user_id,
      status,
      verification_passed,
      payment_intent_id,
      total_amount_cents,
      feedback_credit_cents,
      capture_amount_cents
    `)
    .eq("user_id", user.id)
    .eq("status", "pending")
    .single();

  if (error || !order) {
    return NextResponse.json(
      { error: "No pending order found" },
      { status: 400 }
    );
  }

  // 3️⃣ Verification gate (FINAL)
  if (!order.verification_passed) {
    return NextResponse.json(
      { error: "Prescription not verified" },
      { status: 403 }
    );
  }

  if (!order.payment_intent_id) {
    return NextResponse.json(
      { error: "Missing Stripe PaymentIntent" },
      { status: 400 }
    );
  }

  // 4️⃣ Capture payment
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
    await stripe.paymentIntents.capture(order.payment_intent_id, {
      amount_to_capture: amountToCapture,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Stripe capture failed",
      },
      { status: 400 }
    );
  }

  // 5️⃣ Mark order paid
  const { data: updatedOrder, error: updateError } = await supabaseServer
    .from("orders")
    .update({
      status: "captured",
    })
    .eq("id", order.id)
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
