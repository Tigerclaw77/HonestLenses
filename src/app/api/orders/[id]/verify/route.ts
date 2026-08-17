export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "../../../../../lib/supabase-server";
import {
  adminAuthErrorResponse,
  logAdminAuthFailure,
  requireAdminUser,
} from "@/lib/admin-auth";
import { captureAuthorizedOrderPayment } from "@/lib/payments/legacyPaymentCommands";
import { sendFounderOperationalAlert } from "@/lib/founderAlerts";
import { runVerificationCaptureWorkflow } from "@/lib/orders/verificationCaptureWorkflow";

type VerifyPayload = {
  revised_total_amount_cents?: number;
  price_reason?: string;
  verified_lens?: string;
};

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  // 1️⃣ Require authenticated user
  const auth = await requireAdminUser(req);
  if (!auth.ok) {
    logAdminAuthFailure("POST /api/orders/[id]/verify", auth);
    return adminAuthErrorResponse(auth);
  }

  const { id: orderId } = await context.params;
  const body: VerifyPayload = await req.json();

  // 3️⃣ Load order (source of truth)
  const { data: order, error: orderError } = await supabaseServer
    .from("orders")
    .select(`
      id,
      status,
      verification_status,
      total_amount_cents,
      capture_amount_cents,
      feedback_credit_cents,
      payment_intent_id,
      revised_total_amount_cents,
      allow_price_increase,
      allow_price_decrease
      ,shipping_email
    `)
    .eq("id", orderId)
    .single();

  if (orderError) {
    console.error("Admin verification order lookup failed", {
      orderId,
      error: orderError.message,
    });
    return NextResponse.json(
      { error: "Unable to load the order.", code: "ORDER_LOOKUP_FAILED" },
      { status: 500 },
    );
  }

  if (!order) {
    return NextResponse.json(
      { error: "Order not found" },
      { status: 404 }
    );
  }

  const originalCents = order.total_amount_cents;

  let revisedCents: number | null = null;
  if (body.revised_total_amount_cents !== undefined) {
    if (
      !Number.isInteger(body.revised_total_amount_cents) ||
      body.revised_total_amount_cents < 0 ||
      body.revised_total_amount_cents > 10_000_000
    ) {
      return NextResponse.json(
        { error: "Invalid revised total." },
        { status: 400 },
      );
    }
    revisedCents = body.revised_total_amount_cents;
  }
  if (
    (body.price_reason?.length ?? 0) > 500 ||
    (body.verified_lens?.length ?? 0) > 300
  ) {
    return NextResponse.json(
      { error: "Verification override details are too long." },
      { status: 400 },
    );
  }

  const priceChanged =
    revisedCents !== null && revisedCents !== originalCents;

  // 4️⃣ Enforce admin pricing constraints
  if (priceChanged && revisedCents !== null) {
    if (revisedCents > originalCents && !order.allow_price_increase) {
      return NextResponse.json(
        { error: "Price increases not allowed for this order" },
        { status: 400 }
      );
    }

    if (revisedCents < originalCents && !order.allow_price_decrease) {
      return NextResponse.json(
        { error: "Price decreases not allowed for this order" },
        { status: 400 }
      );
    }
  }

  let capturePaymentIntentId: string | null = null;
  if (!priceChanged) {
    if (order.status !== "authorized" && order.status !== "captured") {
      return NextResponse.json(
        {
          error:
            "Only an authorized or already-captured order can be verified and reconciled.",
        },
        { status: 409 },
      );
    }
  }

  // 5️⃣ Apply verification outcome
  const workflow = await runVerificationCaptureWorkflow({
    reconcilePayment: async () => {
      if (priceChanged) {
        return { paymentIntentId: "", alreadyCaptured: false };
      }
      return captureAuthorizedOrderPayment(order, "admin-verification");
    },
    persistVerifiedState: async () => {
      let updateQuery = supabaseServer
        .from("orders")
        .update({
          verification_status: priceChanged ? "altered" : "verified",
          verification_passed: !priceChanged,
          verification_completed_at: !priceChanged
            ? new Date().toISOString()
            : null,
          status: priceChanged ? order.status : "captured",
          revised_total_amount_cents: priceChanged ? revisedCents : null,
          price_reason: priceChanged ? body.price_reason ?? null : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId);

      updateQuery = priceChanged
        ? updateQuery.eq("status", order.status)
        : updateQuery.in("status", ["authorized", "captured"]);

      if (order.payment_intent_id) {
        updateQuery = updateQuery.eq("payment_intent_id", order.payment_intent_id);
      }

      const { data: updatedOrder, error: updateError } = await updateQuery
        .select("id, status, verification_status")
        .maybeSingle();
      return updateError ? null : updatedOrder;
    },
  });

  if (!workflow.ok) {
    if (workflow.stage === "capture") {
      return NextResponse.json(
        {
          error:
            "Stripe capture was not confirmed. The order remains unverified; refresh its payment status and retry.",
          code: "CAPTURE_NOT_CONFIRMED",
          retryable: true,
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      {
        error:
          workflow.capture?.paymentIntentId
            ? "Payment is captured, but the verified order state was not saved. Do not fulfill from this screen; retry verification to reconcile the local state."
            : "Unable to save the verification override.",
        code: !priceChanged && workflow.capture?.paymentIntentId
          ? "CAPTURED_STATE_UPDATE_FAILED"
          : "VERIFICATION_STATE_UPDATE_FAILED",
        payment_captured: Boolean(workflow.capture?.paymentIntentId),
        retryable: true,
      },
      { status: 500 }
    );
  }

  capturePaymentIntentId = priceChanged
    ? null
    : workflow.capture.paymentIntentId;

  const { error: eventError } = await supabaseServer.from("order_events").insert({
    order_id: orderId,
    event_type: "admin_verification_override",
    actor: auth.user.email ?? auth.user.id,
    message: body.price_reason?.slice(0, 500) ?? null,
    before: { verification_status: order.verification_status },
    after: {
      verification_status: priceChanged ? "altered" : "verified",
      revised_total_amount_cents: priceChanged ? revisedCents : null,
      payment_intent_id: capturePaymentIntentId,
    },
  });

  try {
    await sendFounderOperationalAlert({
      orderId,
      type: "verification_completed",
      headline: priceChanged
        ? "Verification requires pricing review"
        : "Verification completed — ready to order",
      detail: priceChanged
        ? "Prescription review changed the price; founder approval is required before capture."
        : "Prescription verification is complete, payment is captured, and the order is ready for fulfillment.",
      dedupeSuffix: priceChanged ? "price-altered" : "verified",
    });
  } catch (alertError) {
    console.error("Founder admin-verification alert failed:", alertError);
  }

  return NextResponse.json({
    ok: true,
    verification_status: priceChanged ? "altered" : "verified",
    payment_status: priceChanged ? "authorized" : "captured",
    total_amount_cents: originalCents,
    revised_total_amount_cents: priceChanged ? revisedCents : null,
    event_logged: !eventError,
  });
}
