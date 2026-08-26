export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";

import {
  canAccessOrder,
  getOrderAccess,
  hasOrderAccessContext,
} from "@/lib/order-access";
import {
  checkoutAmountMatchesPaymentIntent,
  getCheckoutAmountCents,
} from "@/lib/payments/checkoutAmount";
import { finalizeCheckoutAuthorization } from "@/lib/payments/checkoutAuthorizationFinalizer";
import { supabaseServer } from "@/lib/supabase-server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const PAYMENT_INTENT_PATTERN = /^pi_[A-Za-z0-9]+$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Finishes an off-site payment return using only Stripe's server-side object.
 * The browser identifies an intent; it never supplies the order or amount.
 */
export async function POST(request: Request) {
  const access = await getOrderAccess(request);
  if (!hasOrderAccessContext(access)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const paymentIntentId =
    body && typeof body.paymentIntentId === "string" ? body.paymentIntentId : null;
  if (!paymentIntentId || !PAYMENT_INTENT_PATTERN.test(paymentIntentId)) {
    return NextResponse.json({ error: "Invalid PaymentIntent reference." }, { status: 400 });
  }

  let intent: Stripe.PaymentIntent;
  try {
    intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch {
    return NextResponse.json({ error: "Payment authorization could not be verified." }, { status: 400 });
  }
  const orderId = intent.metadata?.order_id?.trim() ?? "";
  if (!UUID_PATTERN.test(orderId)) {
    return NextResponse.json({ error: "Payment authorization is not linked to an order." }, { status: 400 });
  }
  if (intent.status !== "requires_capture" && intent.status !== "succeeded") {
    return NextResponse.json(
      { error: `Payment not authorized (status: ${intent.status})` },
      { status: 409 },
    );
  }

  const { data: orderRaw, error } = await supabaseServer
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .eq("payment_intent_id", intent.id)
    .in("status", ["draft", "authorized", "captured"])
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: "Unable to load checkout." }, { status: 500 });
  }
  if (!orderRaw) {
    return NextResponse.json({ error: "Payment does not match an active order." }, { status: 400 });
  }
  if (!canAccessOrder(access, orderRaw)) {
    return NextResponse.json({ error: "Order not authorized." }, { status: 403 });
  }

  const checkoutOrder = {
    id: orderId,
    total_amount_cents:
      typeof orderRaw.total_amount_cents === "number"
        ? orderRaw.total_amount_cents
        : null,
    feedback_credit_cents:
      typeof orderRaw.feedback_credit_cents === "number"
        ? orderRaw.feedback_credit_cents
        : null,
  };
  let expectedAmountCents: number;
  try {
    expectedAmountCents = getCheckoutAmountCents(checkoutOrder);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Order checkout amount is invalid" },
      { status: 400 },
    );
  }
  if (!checkoutAmountMatchesPaymentIntent(checkoutOrder, intent.amount)) {
    return NextResponse.json(
      {
        error: "Checkout amount changed before authorization.",
        code: "CHECKOUT_AMOUNT_MISMATCH",
        expected_amount_cents: expectedAmountCents,
      },
      { status: 409 },
    );
  }

  try {
    const result = await finalizeCheckoutAuthorization({
      orderRaw,
      intent,
      request,
      distinctId: access.distinctId,
      customerEmail: access.userEmail,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Checkout redirect authorization finalization failed", {
      orderId,
      paymentIntentId,
      error,
    });
    return NextResponse.json({ error: "Unable to finalize checkout." }, { status: 500 });
  }
}
