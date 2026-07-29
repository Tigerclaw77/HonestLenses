export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "../../../../../lib/supabase-server";
import { getUserFromRequest } from "../../../../../lib/get-user-from-request";
import { cancelOrderPayment } from "@/lib/payments/legacyPaymentCommands";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  // 1️⃣ Require authenticated user
  const user = await getUserFromRequest(req);

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  const { id: orderId } = await context.params;

  // 2️⃣ Load order (must belong to user)
  const { data, error } = await supabaseServer
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json(
      { error: "Unable to load the order." },
      { status: 500 },
    );
  }

  if (!data || data.length === 0) {
    return NextResponse.json(
      { error: "Order not found" },
      { status: 404 },
    );
  }

  const order = data[0];

  // 3️⃣ Enforce state
  if (order.status !== "authorized") {
    return NextResponse.json(
      { error: "Order is not cancellable" },
      { status: 400 },
    );
  }

  if (!order.payment_intent_id) {
    return NextResponse.json(
      { error: "Missing payment_intent_id" },
      { status: 400 },
    );
  }

  // 4️⃣ Cancel PaymentIntent. A retry after Stripe succeeds but before the
  // database update must converge on the same cancellation.
  try {
    await cancelOrderPayment(
      { orderId, paymentIntentId: order.payment_intent_id },
      "customer-cancel",
    );
  } catch {
    return NextResponse.json(
      { error: "Payment can no longer be cancelled." },
      { status: 409 },
    );
  }

  // 5️⃣ Update order state
  const { error: updateError } = await supabaseServer
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", orderId)
    .eq("user_id", user.id);

  if (updateError) {
    return NextResponse.json(
      { error: "Unable to save the cancellation." },
      { status: 500 },
    );
  }

  await supabaseServer.from("order_events").insert({
    order_id: orderId,
    event_type: "order_cancelled_by_customer",
    actor: user.id,
  });

  return NextResponse.json({ ok: true });
}
