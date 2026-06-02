import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseServer } from "@/lib/supabase-server";
import { getCaptureAmountCents } from "@/lib/payments/captureAmount";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  const { orderId, result, notes } = await req.json();

  if (!orderId || !result) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { data: order } = await supabaseServer
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .single();

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (result === "verified") {
    if (!order.payment_intent_id) {
      return NextResponse.json(
        { error: "Missing payment_intent_id" },
        { status: 400 },
      );
    }

    const amountToCapture = getCaptureAmountCents(order);

    const intent = await stripe.paymentIntents.retrieve(order.payment_intent_id);

    if (intent.status === "requires_capture") {
      await stripe.paymentIntents.capture(order.payment_intent_id, {
        amount_to_capture: amountToCapture,
      });
    } else if (intent.status !== "succeeded") {
      return NextResponse.json(
        { error: `PaymentIntent is not capturable (status: ${intent.status})` },
        { status: 400 },
      );
    }

    const { data: updatedOrder, error: updateError } = await supabaseServer
      .from("orders")
      .update({
        verification_status: "verified",
        verification_completed_at: new Date().toISOString(),
        verification_method: "active",
        status: "captured",
      })
      .eq("id", orderId)
      .eq("payment_intent_id", order.payment_intent_id)
      .select("id")
      .maybeSingle();

    if (updateError || !updatedOrder) {
      return NextResponse.json(
        {
          error:
            updateError?.message ?? "Order state update did not match any rows",
        },
        { status: 500 },
      );
    }
  }

  if (result === "rejected") {
    if (order.payment_intent_id) {
      await stripe.paymentIntents.cancel(order.payment_intent_id);
    }

    const { data: updatedOrder, error: updateError } = await supabaseServer
      .from("orders")
      .update({
        verification_status: "rejected",
        verification_completed_at: new Date().toISOString(),
        status: "cancelled",
      })
      .eq("id", orderId)
      .select("id")
      .maybeSingle();

    if (updateError || !updatedOrder) {
      return NextResponse.json(
        {
          error:
            updateError?.message ?? "Order state update did not match any rows",
        },
        { status: 500 },
      );
    }
  }

  await supabaseServer.from("order_events").insert({
    order_id: orderId,
    event_type: `verification_${result}`,
    actor: "system",
    message: notes || null,
  });

  return NextResponse.json({ success: true });
}
