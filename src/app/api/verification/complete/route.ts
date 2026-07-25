import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseServer } from "@/lib/supabase-server";
import { getCaptureAmountCents } from "@/lib/payments/captureAmount";
import {
  getCaptureReadiness,
  getRequiredPaymentIntentId,
} from "@/lib/orders/captureReadiness";
import { hasInternalBearerAuthorization } from "@/lib/internal-auth";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  if (!hasInternalBearerAuthorization(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const orderId =
    body && typeof body.orderId === "string" ? body.orderId.trim() : "";
  const result =
    body && (body.result === "verified" || body.result === "rejected")
      ? body.result
      : null;
  const notes =
    body && typeof body.notes === "string" ? body.notes.trim() : null;

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
    const paymentIntent = getRequiredPaymentIntentId(order);
    if (!paymentIntent.ok) {
      return NextResponse.json(
        { error: paymentIntent.error },
        { status: 400 },
      );
    }

    const amountToCapture = getCaptureAmountCents(order);

    const intent = await stripe.paymentIntents.retrieve(
      paymentIntent.paymentIntentId,
    );
    const readiness = getCaptureReadiness(order, intent);

    if (readiness.shouldCapture) {
      await stripe.paymentIntents.capture(paymentIntent.paymentIntentId, {
        amount_to_capture: amountToCapture,
      });
    } else if (!readiness.canProceed) {
      return NextResponse.json(
        { error: readiness.error },
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
      .eq("payment_intent_id", paymentIntent.paymentIntentId)
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
