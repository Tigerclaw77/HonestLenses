import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseServer } from "@/lib/supabase-server";

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
    await stripe.paymentIntents.capture(order.payment_intent_id);

    await supabaseServer.from("orders").update({
      verification_status: "verified",
      verification_completed_at: new Date().toISOString(),
      verification_method: "active",
      status: "captured",
    }).eq("id", orderId);
  }

  if (result === "rejected") {
    await stripe.paymentIntents.cancel(order.payment_intent_id);

    await supabaseServer.from("orders").update({
      verification_status: "rejected",
      verification_completed_at: new Date().toISOString(),
      status: "cancelled",
    }).eq("id", orderId);
  }

  await supabaseServer.from("order_events").insert({
    order_id: orderId,
    event_type: `verification_${result}`,
    actor: "system",
    message: notes || null,
  });

  return NextResponse.json({ success: true });
}
