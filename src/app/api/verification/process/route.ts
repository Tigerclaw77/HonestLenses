import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseServer } from "@/lib/supabase-server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  // ✅ 1. AUTH FIRST (before touching DB)
  const auth = req.headers.get("authorization");

  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date().toISOString();

  // ✅ 2. Then query orders
  const { data: orders, error } = await supabaseServer
    .from("orders")
    .select("*")
    .eq("status", "pending_verification")
    .eq("verification_status", "pending")
    .lte("passive_deadline_at", now);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!orders?.length) {
    return NextResponse.json({ success: true });
  }

  for (const order of orders) {
    if (!order.payment_intent_id) continue;

    const intent = await stripe.paymentIntents.retrieve(
      order.payment_intent_id
    );

    if (intent.status !== "requires_capture") continue;

    await stripe.paymentIntents.capture(order.payment_intent_id);

    await supabaseServer
      .from("orders")
      .update({
        status: "captured",
        verification_status: "verified",
        verification_passed: true,
        verification_completed_at: now,
      })
      .eq("id", order.id);

    await supabaseServer.from("order_events").insert({
      order_id: order.id,
      event_type: "verification_passive_auto",
      actor: "system",
    });
  }

  return NextResponse.json({ success: true });
}
