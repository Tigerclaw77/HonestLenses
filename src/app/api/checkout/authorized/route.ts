export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseServer } from "../../../../lib/supabase-server";
import { getUserFromRequest } from "../../../../lib/get-user-from-request";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  // 1️⃣ Auth
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2️⃣ Load draft order (the one we just authorized)
  const { data: order, error } = await supabaseServer
    .from("orders")
    .select(`
      id,
      user_id,
      status,
      stripe_payment_intent_id
    `)
    .eq("user_id", user.id)
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !order) {
    return NextResponse.json({ error: "No draft order" }, { status: 400 });
  }

  if (!order.stripe_payment_intent_id) {
    return NextResponse.json(
      { error: "Missing Stripe PaymentIntent" },
      { status: 400 }
    );
  }

  // 3️⃣ Verify Stripe intent is actually authorized (manual capture)
  const intent = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id);

  // For manual capture, successful authorization typically ends in `requires_capture`
  if (intent.status !== "requires_capture") {
    return NextResponse.json(
      { error: `Payment not authorized (status: ${intent.status})` },
      { status: 400 }
    );
  }

  // 4️⃣ Mark order pending (this is the ONLY place we flip draft → pending)
  const { error: updateError } = await supabaseServer
    .from("orders")
    .update({ status: "pending" })
    .eq("id", order.id)
    .eq("user_id", user.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
