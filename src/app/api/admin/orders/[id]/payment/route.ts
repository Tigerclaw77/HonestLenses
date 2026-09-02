import { NextResponse } from "next/server";

import {
  adminAuthErrorResponse,
  logAdminAuthFailure,
  requireAdminUser,
} from "@/lib/admin-auth";
import { captureAuthorizedOrderPayment } from "@/lib/payments/legacyPaymentCommands";
import {
  getAdminStripe,
  reconcileAdminPaymentState,
} from "@/lib/payments/adminPaymentReconciliation";
import { supabaseServer } from "@/lib/supabase-server";

type PaymentActionBody = { action?: unknown };

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminUser(req);
  if (!auth.ok) {
    logAdminAuthFailure("POST /api/admin/orders/[id]/payment", auth);
    return adminAuthErrorResponse(auth);
  }

  const { id } = await context.params;
  let body: PaymentActionBody = {};
  try {
    body = (await req.json()) as PaymentActionBody;
  } catch {
    // The action validation below handles malformed input.
  }
  const action = body.action;
  if (action !== "capture" && action !== "sync") {
    return NextResponse.json({ error: "Invalid payment action." }, { status: 400 });
  }

  const { data: order, error } = await supabaseServer
    .from("orders")
    .select(
      "id, status, payment_intent_id, total_amount_cents, capture_amount_cents, feedback_credit_cents, authorization_expires_at, shipping_email",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Unable to load the order." }, { status: 500 });
  }
  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }
  if (!order.payment_intent_id) {
    return NextResponse.json(
      { error: "This order has no Stripe PaymentIntent to reconcile." },
      { status: 409 },
    );
  }

  const stripe = getAdminStripe();
  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe is not configured for the admin workspace." },
      { status: 503 },
    );
  }

  try {
    let alreadyDone = false;
    if (action === "capture") {
      const capture = await captureAuthorizedOrderPayment(order, "admin-operator");
      alreadyDone = capture.alreadyCaptured;
    }

    const intent = await stripe.paymentIntents.retrieve(order.payment_intent_id);
    const actor = auth.user.email ?? auth.user.id;
    const reconciliation = await reconcileAdminPaymentState({
      order,
      stripeStatus: intent.status,
      actor,
      source: action === "capture" ? "operator_capture" : "operator_sync",
    });

    return NextResponse.json({
      ok: true,
      action,
      payment_status:
        intent.status === "succeeded"
          ? "captured"
          : intent.status === "requires_capture"
            ? "authorized"
            : reconciliation.status,
      stripe_payment_intent_status: intent.status,
      already_done: alreadyDone || !reconciliation.changed,
      event_logged: reconciliation.eventLogged,
    });
  } catch (paymentError) {
    console.error("Admin payment action failed", { orderId: id, action, error: paymentError });
    return NextResponse.json(
      {
        error:
          action === "capture"
            ? "Stripe did not confirm payment capture. No local capture status was invented."
            : "Stripe payment status could not be synchronized.",
      },
      { status: 409 },
    );
  }
}

export const runtime = "nodejs";
