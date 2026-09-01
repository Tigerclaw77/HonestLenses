export const runtime = "nodejs";

import { NextResponse } from "next/server";
import {
  adminAuthErrorResponse,
  logAdminAuthFailure,
  requireAdminUser,
} from "@/lib/admin-auth";
import { isFounderOverrideEligible } from "@/lib/orders/adminWorkflow";
import { captureAuthorizedOrderPayment } from "@/lib/payments/legacyPaymentCommands";
import { supabaseServer } from "@/lib/supabase-server";

type FounderOverridePayload = { reason?: unknown };

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminUser(req);
  if (!auth.ok) {
    logAdminAuthFailure("POST /api/admin/orders/[id]/founder-override", auth);
    return adminAuthErrorResponse(auth);
  }

  const { id: orderId } = await context.params;
  let body: FounderOverridePayload = {};
  try {
    body = (await req.json()) as FounderOverridePayload;
  } catch {
    // Invalid JSON receives the same validation response as a missing reason.
  }

  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason || reason.length > 500) {
    return NextResponse.json(
      { error: "A founder override reason between 1 and 500 characters is required." },
      { status: 400 },
    );
  }

  const { data: order, error: orderError } = await supabaseServer
    .from("orders")
    .select(
      "id, status, fulfillment_status, verification_status, rx_status, rx_source, rx, rx_upload_path, prescriber_name, prescriber_email, prescriber_phone, payment_intent_id, total_amount_cents, capture_amount_cents, feedback_credit_cents, authorization_expires_at, shipping_email",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) {
    return NextResponse.json({ error: "Unable to load the order." }, { status: 500 });
  }
  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }
  if (!isFounderOverrideEligible(order)) {
    return NextResponse.json(
      {
        error: "Founder Override is limited to paid or authorized orders in prescription review.",
        code: "FOUNDER_OVERRIDE_NOT_ELIGIBLE",
      },
      { status: 409 },
    );
  }

  let capturedPaymentIntentId: string | null = null;
  try {
    const capture = await captureAuthorizedOrderPayment(
      order,
      "admin-verification",
    );
    capturedPaymentIntentId = capture.paymentIntentId;
  } catch {
    return NextResponse.json(
      {
        error: "Stripe capture was not confirmed. The order remains unverified; refresh payment status and retry.",
        code: "CAPTURE_NOT_CONFIRMED",
        retryable: true,
      },
      { status: 409 },
    );
  }

  const actor = auth.user.email ?? auth.user.id;
  const { data: updatedOrder, error: overrideError } = await supabaseServer.rpc(
    "apply_founder_verification_override",
    {
      p_order_id: orderId,
      p_actor: actor,
      p_reason: reason,
      p_payment_intent_id: order.payment_intent_id,
    },
  );

  if (overrideError || !updatedOrder) {
    return NextResponse.json(
      {
        error: capturedPaymentIntentId
          ? "Payment is captured, but the founder override was not saved. Retry to reconcile the local state."
          : "Unable to save the founder override.",
        code: "FOUNDER_OVERRIDE_STATE_UPDATE_FAILED",
        payment_captured: Boolean(capturedPaymentIntentId),
        retryable: true,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    order: updatedOrder,
    verification_status: "verified",
    fulfillment_status: "ready_to_order",
    payment_status: "captured",
  });
}
