import { NextRequest, NextResponse } from "next/server";
import {
  classifyAbandonedCheckout,
  getAbandonedCheckoutThresholdHours,
  getStaleCheckoutThresholdHours,
} from "@/lib/ops/abandonedCheckout";
import { buildAbandonedCheckoutRecoveryEmail } from "@/lib/email/recoveryEmail";
import { POSTHOG_EVENTS } from "@/lib/posthog/events";
import { captureServerEvent } from "@/lib/posthog/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  adminAuthErrorResponse,
  logAdminAuthFailure,
  requireAdminUser,
} from "@/lib/admin-auth";

type AdminAbandonedAction =
  | "archive"
  | "ignore"
  | "draft_recovery_email";

type ActionBody = {
  action?: AdminAbandonedAction;
};

type OrderRow = {
  id: string;
  user_id: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
  archived: boolean | null;
  payment_intent_id: string | null;
  total_amount_cents: number | null;
  rx: unknown;
  rx_source: string | null;
  rx_upload_path: string | null;
  prescriber_name: string | null;
  prescriber_email: string | null;
  prescriber_phone: string | null;
  patient_name: string | null;
  patient_full_name: string | null;
  shipping_first_name: string | null;
  shipping_last_name: string | null;
  shipping_email: string | null;
};

function isAction(value: unknown): value is AdminAbandonedAction {
  return (
    value === "archive" ||
    value === "ignore" ||
    value === "draft_recovery_email"
  );
}

async function parseBody(req: NextRequest): Promise<ActionBody> {
  try {
    const value = (await req.json()) as ActionBody;
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function customerName(order: OrderRow): string | null {
  return (
    order.patient_name ||
    order.patient_full_name ||
    `${order.shipping_first_name ?? ""} ${order.shipping_last_name ?? ""}`.trim() ||
    null
  );
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminUser(req);
  if (!auth.ok) {
    logAdminAuthFailure("POST /api/admin/abandoned-checkouts/[id]", auth);
    return adminAuthErrorResponse(auth);
  }

  const { id } = await context.params;
  const body = await parseBody(req);

  if (!isAction(body.action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const { data: order, error } = await supabaseServer
    .from("orders")
    .select(
      `
      id,
      user_id,
      status,
      created_at,
      updated_at,
      archived,
      payment_intent_id,
      total_amount_cents,
      rx,
      rx_source,
      rx_upload_path,
      prescriber_name,
      prescriber_email,
      prescriber_phone,
      patient_name,
      patient_full_name,
      shipping_first_name,
      shipping_last_name,
      shipping_email
    `,
    )
    .eq("id", id)
    .maybeSingle<OrderRow>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const thresholdHours = getAbandonedCheckoutThresholdHours(
    process.env.ABANDONED_CHECKOUT_THRESHOLD_HOURS,
  );
  const staleThresholdHours = getStaleCheckoutThresholdHours(
    process.env.STALE_CHECKOUT_THRESHOLD_HOURS,
  );
  const classification = classifyAbandonedCheckout(order, {
    thresholdHours,
    staleThresholdHours,
  });

  if (!classification.isAbandoned) {
    return NextResponse.json(
      { error: "Order is not an abandoned draft" },
      { status: 400 },
    );
  }

  if (body.action === "draft_recovery_email") {
    const draft = buildAbandonedCheckoutRecoveryEmail({
      customerName: customerName(order),
      customerEmail: order.shipping_email,
      orderId: order.id,
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL,
    });

    await captureServerEvent({
      event: POSTHOG_EVENTS.RECOVERY_EMAIL_DRAFTED,
      distinctId: order.user_id,
      request: req,
      properties: {
        order_id: order.id,
        has_email: Boolean(draft.to),
        order_value_cents: order.total_amount_cents,
        total_amount_cents: order.total_amount_cents,
        primary_reason: classification.primaryReason,
        had_payment_intent: Boolean(order.payment_intent_id),
      },
    });

    return NextResponse.json({ ok: true, draft });
  }

  const update =
    body.action === "ignore"
      ? {
          status: "ignored",
          archived: true,
          archived_at: new Date().toISOString(),
        }
      : {
          archived: true,
          archived_at: new Date().toISOString(),
        };

  const { data: updated, error: updateError } = await supabaseServer
    .from("orders")
    .update(update)
    .eq("id", order.id)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (!updated) {
    return NextResponse.json(
      { error: "Order changed before action completed" },
      { status: 409 },
    );
  }

  await captureServerEvent({
    event: POSTHOG_EVENTS.ABANDONED_CHECKOUT_ARCHIVED,
    distinctId: order.user_id,
    request: req,
    properties: {
      order_id: order.id,
      admin_action: body.action,
      order_value_cents: order.total_amount_cents,
      total_amount_cents: order.total_amount_cents,
      primary_reason: classification.primaryReason,
      had_payment_intent: Boolean(order.payment_intent_id),
    },
  });

  return NextResponse.json({ ok: true, action: body.action });
}
