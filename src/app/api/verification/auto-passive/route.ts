export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseServer } from "../../../../lib/supabase-server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST() {
  try {
    /* 1️⃣ Find orders eligible for passive verification */
    const { data: orders, error } = await supabaseServer
      .from("orders")
      .select(`
        id,
        payment_intent_id,
        passive_deadline_at,
        status
      `)
      .eq("status", "pending_verification")
      .lte("passive_deadline_at", new Date().toISOString());

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!orders || orders.length === 0) {
      return NextResponse.json({ ok: true, processed: 0 });
    }

    let processed = 0;

    for (const order of orders) {
      if (!order.payment_intent_id) continue;

      /* 2️⃣ Retrieve Stripe intent */
      const intent = await stripe.paymentIntents.retrieve(
        order.payment_intent_id
      );

      if (intent.status !== "requires_capture") {
        continue;
      }

      /* 3️⃣ Capture payment */
      await stripe.paymentIntents.capture(order.payment_intent_id);

      /* 4️⃣ Update order */
      await supabaseServer
        .from("orders")
        .update({
          status: "captured",
          verification_passed: true,
        })
        .eq("id", order.id);

      processed++;
    }

    return NextResponse.json({ ok: true, processed });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
