import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  adminAuthErrorResponse,
  logAdminAuthFailure,
  requireAdminUser,
} from "@/lib/admin-auth";
import {
  assessAdminFulfillmentTransition,
  getAdminFulfillmentStatus,
  isAdminFulfillmentStatus,
} from "@/lib/orders/adminWorkflow";
import {
  getAdminStripe,
  reconcileAdminPaymentState,
} from "@/lib/payments/adminPaymentReconciliation";

type PatchBody = {
  fulfillment_status?: unknown;
  admin_notes?: unknown;
  resolve_email_attention?: unknown;
};

const ADMIN_ORDER_DETAIL_FIELDS = [
  "id", "created_at", "updated_at", "user_id", "status", "verification_status",
  "verification_requested_at", "verification_completed_at", "verification_sent_at",
  "verification_details_submitted_at", "rx_status", "rx", "rx_ocr_raw", "rx_source",
  "rx_upload_path", "rx_lens_brand", "prescriber_name",
  "prescriber_email", "prescriber_phone", "prescriber_fax", "shipping_email",
  "shipping_first_name", "shipping_last_name", "shipping_phone", "shipping_address1",
  "shipping_address2", "shipping_city", "shipping_state", "shipping_zip", "patient_name",
  "patient_full_name", "patient_first_name", "patient_middle_name", "patient_last_name",
  "rx_patient_name", "sku", "box_count", "total_box_count", "right_box_count", "left_box_count",
  "adjusted_right_box_count", "adjusted_left_box_count",
  "adjusted_total_box_count", "order_quantity_adjustment_reason", "order_quantity_adjusted_by",
  "order_quantity_adjusted_at", "total_amount_cents", "capture_amount_cents",
  "capture_adjustment_reason", "capture_adjusted_by", "capture_adjusted_at", "shipping_cents",
  "shipping_method", "payment_intent_id", "fulfillment_status", "email_delivery_status", "email_last_event",
  "email_last_event_at", "email_failure_reason", "email_delivery_requires_attention",
  "confirmation_email_sent_at", "confirmation_email_delivered_at", "admin_notes", "archived",
  "archived_at",
].join(",");

const ADMIN_ORDER_PATCH_FIELDS = [
  "id", "updated_at", "status", "fulfillment_status", "payment_intent_id",
  "email_delivery_requires_attention", "admin_notes", "adjusted_right_box_count",
  "adjusted_left_box_count", "adjusted_total_box_count", "capture_amount_cents",
].join(",");

async function parseBody(req: NextRequest): Promise<PatchBody> {
  try {
    const value = (await req.json()) as PatchBody;
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminUser(req);
  if (!auth.ok) {
    logAdminAuthFailure("GET /api/admin/orders/[id]", auth);
    return adminAuthErrorResponse(auth);
  }

  const { id } = await context.params;
  const { data, error } = await supabaseServer
    .from("orders")
    .select(ADMIN_ORDER_DETAIL_FIELDS as "*")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: "Unable to load the order." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  return NextResponse.json({ order: data });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminUser(req);
  if (!auth.ok) {
    logAdminAuthFailure("PATCH /api/admin/orders/[id]", auth);
    return adminAuthErrorResponse(auth);
  }

  const { id } = await context.params;
  const body = await parseBody(req);
  const update: Record<string, unknown> = {};

  if ("fulfillment_status" in body) {
    if (!isAdminFulfillmentStatus(body.fulfillment_status)) {
      return NextResponse.json(
        { error: "Invalid fulfillment status" },
        { status: 400 },
      );
    }

    update.fulfillment_status = body.fulfillment_status;
  }

  if ("admin_notes" in body) {
    if (typeof body.admin_notes !== "string") {
      return NextResponse.json(
        { error: "Invalid admin notes" },
        { status: 400 },
      );
    }

    update.admin_notes = body.admin_notes;
  }

  if ("resolve_email_attention" in body) {
    if (body.resolve_email_attention !== true) {
      return NextResponse.json(
        { error: "Invalid email-resolution action" },
        { status: 400 },
      );
    }
    update.email_delivery_requires_attention = false;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No changes supplied" }, { status: 400 });
  }

  const { data: currentOrder, error: currentOrderError } = await supabaseServer
    .from("orders")
    // Action-only read: retain all inputs to payment/Rx/fulfillment safety checks.
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (currentOrderError) {
    return NextResponse.json(
      { error: "Unable to load the order." },
      { status: 500 },
    );
  }

  if (!currentOrder) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (
    "fulfillment_status" in body &&
    getAdminFulfillmentStatus(currentOrder) === body.fulfillment_status
  ) {
    return NextResponse.json({
      ok: true,
      order: currentOrder,
      warnings: [],
      event_logged: true,
      already_done: true,
    });
  }

  let operationalOrder = currentOrder;
  if (
    body.fulfillment_status === "ordered" &&
    currentOrder.payment_intent_id
  ) {
    const stripe = getAdminStripe();
    if (!stripe) {
      return NextResponse.json(
        { error: "Stripe is unavailable; payment capture cannot be confirmed." },
        { status: 503 },
      );
    }

    try {
      const intent = await stripe.paymentIntents.retrieve(
        currentOrder.payment_intent_id,
      );
      const actor = auth.user.email ?? auth.user.id;
      const reconciliation = await reconcileAdminPaymentState({
        order: currentOrder,
        stripeStatus: intent.status,
        actor,
        source: "operator_sync",
      });
      operationalOrder = {
        ...currentOrder,
        status: reconciliation.status,
        stripe_payment_intent_status: intent.status,
      };
    } catch (paymentError) {
      console.error("Supplier placement payment check failed", {
        orderId: id,
        error: paymentError,
      });
      return NextResponse.json(
        { error: "Unable to confirm payment status with Stripe." },
        { status: 409 },
      );
    }
  }

  const transition =
    "fulfillment_status" in body
      ? assessAdminFulfillmentTransition(
          operationalOrder,
          body.fulfillment_status,
        )
      : null;

  if (transition && !transition.valid) {
    return NextResponse.json(
      { error: "Invalid fulfillment transition" },
      { status: 400 },
    );
  }

  if (transition && !transition.allowed) {
    return NextResponse.json(
      {
        error: transition.warnings.join(" ") || "The requested action cannot be completed.",
        code: "OPERATION_PREREQUISITE_NOT_MET",
      },
      { status: 409 },
    );
  }

  update.updated_at = new Date().toISOString();

  const { data, error } = await supabaseServer
    .from("orders")
    .update(update)
    .eq("id", id)
    .select(ADMIN_ORDER_PATCH_FIELDS as "*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Unable to update the order." }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  let eventLogged = true;
  if (transition?.targetStatus) {
    const actor = auth.user.email ?? auth.user.id;
    const message = [
      transition.targetStatus === "ordered"
        ? `Operator recorded supplier order placed from ${transition.currentStatus}.`
        : `Operator changed fulfillment from ${transition.currentStatus} to ${transition.targetStatus}.`,
      ...transition.warnings,
    ].join(" ");
    const { error: eventError } = await supabaseServer
      .from("order_events")
      .insert({
        order_id: id,
        event_type:
          transition.targetStatus === "ordered"
            ? "admin_supplier_order_placed"
            : "admin_fulfillment_updated",
        actor,
        message,
        before: {
          fulfillment_status: transition.currentStatus,
        },
        after: {
          fulfillment_status: transition.targetStatus,
        },
      });

    if (eventError) {
      eventLogged = false;
      console.warn("Admin fulfillment event logging failed", {
        orderId: id,
        error: eventError.message,
      });
    }
  }

  if (body.resolve_email_attention === true) {
    const actor = auth.user.email ?? auth.user.id;
    const { error: eventError } = await supabaseServer
      .from("order_events")
      .insert({
        order_id: id,
        event_type: "admin_email_attention_resolved",
        actor,
        message: "Operator marked the customer email issue resolved.",
        before: {
          email_delivery_requires_attention:
            currentOrder.email_delivery_requires_attention,
        },
        after: { email_delivery_requires_attention: false },
      });
    if (eventError) eventLogged = false;
  }

  return NextResponse.json({
    ok: true,
    order: data,
    warnings: transition?.warnings ?? [],
    event_logged: eventLogged,
    already_done: false,
  });
}
