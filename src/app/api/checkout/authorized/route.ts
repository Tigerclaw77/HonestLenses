export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";

import {
  canAccessOrder,
  getOrderAccess,
  hasOrderAccessContext,
} from "@/lib/order-access";
import { getRequiredPaymentIntentId } from "@/lib/orders/captureReadiness";
import {
  checkoutAmountMatchesPaymentIntent,
  getCheckoutAmountCents,
} from "@/lib/payments/checkoutAmount";
import { finalizeCheckoutAuthorization } from "@/lib/payments/checkoutAuthorizationFinalizer";
import { supabaseServer } from "@/lib/supabase-server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(record: UnknownRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

async function safeJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/**
 * Normal non-redirect checkout completion. Redirect returns use
 * /api/checkout/return, but both routes deliberately share the exact same
 * server-side finalization transition.
 */
export async function POST(request: Request) {
  const access = await getOrderAccess(request);
  if (!hasOrderAccessContext(access)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await safeJson(request);
  const requestedOrderId = isRecord(body) ? getString(body, "orderId") : null;
  const query = supabaseServer
    .from("orders")
    .select("*")
    .in("status", ["draft", "authorized", "captured"]);
  const { data: orderRaw, error } = requestedOrderId
    ? await query.eq("id", requestedOrderId).maybeSingle()
    : access.guestOrderId
      ? await query.eq("id", access.guestOrderId).maybeSingle()
      : await query
          .eq("user_id", access.userId ?? "")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Unable to load checkout." }, { status: 500 });
  }
  if (!orderRaw || !isRecord(orderRaw)) {
    return NextResponse.json(
      { error: "No checkout order awaiting authorization" },
      { status: 400 },
    );
  }
  if (!canAccessOrder(access, orderRaw as { id: string | null; user_id?: string | null })) {
    return NextResponse.json({ error: "Order not authorized" }, { status: 403 });
  }

  const orderId = getString(orderRaw, "id");
  if (!orderId) {
    return NextResponse.json({ error: "Order missing id" }, { status: 500 });
  }
  const payment = getRequiredPaymentIntentId(
    { payment_intent_id: getString(orderRaw, "payment_intent_id") },
    "Missing Stripe PaymentIntent",
  );
  if (!payment.ok) {
    return NextResponse.json({ error: payment.error }, { status: 400 });
  }

  const intent = await stripe.paymentIntents.retrieve(payment.paymentIntentId);
  // Every caller must prove the Stripe object's binding to this exact order.
  if (intent.metadata?.order_id !== orderId) {
    return NextResponse.json(
      { error: "PaymentIntent does not match this order" },
      { status: 400 },
    );
  }
  if (intent.status !== "requires_capture" && intent.status !== "succeeded") {
    return NextResponse.json(
      { error: `Payment not authorized (status: ${intent.status})` },
      { status: 400 },
    );
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
        error: "Checkout amount changed before authorization. Refresh checkout and approve the updated total.",
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
      allowAutomaticCapture: true,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Checkout authorization finalization failed", { orderId, error });
    return NextResponse.json({ error: "Unable to finalize checkout." }, { status: 500 });
  }
}
