import { NextResponse } from "next/server";
import {
  adminAuthErrorResponse,
  logAdminAuthFailure,
  requireAdminUser,
} from "@/lib/admin-auth";
import { getFeedbackAmountDueCents } from "@/lib/abandonmentFeedback";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";

const CAPTURE_ADJUSTMENT_REASONS = [
  "Quantity correction",
  "Prescription correction",
  "Shipping adjustment",
  "Inventory adjustment",
  "Customer service accommodation",
  "Other",
] as const;

type CaptureAdjustmentReason = (typeof CAPTURE_ADJUSTMENT_REASONS)[number];

type RequestBody = {
  order_id?: unknown;
  orderId?: unknown;
  capture_amount_cents?: unknown;
  reason?: unknown;
  capture_adjustment_reason?: unknown;
};

type OrderRow = {
  id: string;
  total_amount_cents: number | null;
  feedback_credit_cents: number | null;
};

function isCaptureAdjustmentReason(
  value: unknown,
): value is CaptureAdjustmentReason {
  return CAPTURE_ADJUSTMENT_REASONS.includes(
    value as CaptureAdjustmentReason,
  );
}

function isIntegerCents(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

async function parseBody(req: Request): Promise<RequestBody> {
  try {
    const value = (await req.json()) as RequestBody;
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

export async function POST(req: Request) {
  const auth = await requireAdminUser(req);
  if (!auth.ok) {
    logAdminAuthFailure(
      "POST /api/admin/orders/adjust-capture-amount",
      auth,
    );
    return adminAuthErrorResponse(auth);
  }

  const body = await parseBody(req);
  const orderId = body.order_id ?? body.orderId;
  const captureAmountCents = body.capture_amount_cents;
  const reason = body.reason ?? body.capture_adjustment_reason;

  if (typeof orderId !== "string" || !orderId.trim()) {
    return NextResponse.json(
      { error: "Order id is required.", code: "ORDER_ID_REQUIRED" },
      { status: 400 },
    );
  }

  if (!isIntegerCents(captureAmountCents)) {
    return NextResponse.json(
      {
        error: "Capture amount must be supplied in whole cents.",
        code: "INVALID_CAPTURE_AMOUNT",
      },
      { status: 400 },
    );
  }

  if (!isCaptureAdjustmentReason(reason)) {
    return NextResponse.json(
      {
        error: "Select a valid capture adjustment reason.",
        code: "INVALID_CAPTURE_REASON",
      },
      { status: 400 },
    );
  }

  const { data: order, error: orderError } = await supabaseServer
    .from("orders")
    .select("id, total_amount_cents, feedback_credit_cents")
    .eq("id", orderId)
    .maybeSingle<OrderRow>();

  if (orderError) {
    return NextResponse.json(
      { error: orderError.message, code: "ORDER_LOOKUP_FAILED" },
      { status: 500 },
    );
  }

  if (!order) {
    return NextResponse.json(
      { error: "Order not found.", code: "ORDER_NOT_FOUND" },
      { status: 404 },
    );
  }

  if (
    !isIntegerCents(order.total_amount_cents) ||
    order.total_amount_cents <= 0
  ) {
    return NextResponse.json(
      {
        error: "Order is missing a valid authorized amount.",
        code: "INVALID_AUTHORIZED_AMOUNT",
      },
      { status: 400 },
    );
  }

  if (captureAmountCents <= 0) {
    return NextResponse.json(
      {
        error: "Capture amount must be greater than $0.00.",
        code: "CAPTURE_AMOUNT_TOO_LOW",
      },
      { status: 400 },
    );
  }

  const amountDueCents = getFeedbackAmountDueCents(order);

  if (captureAmountCents > amountDueCents) {
    return NextResponse.json(
      {
        error: "Capture amount cannot exceed the authorized amount.",
        code: "CAPTURE_AMOUNT_EXCEEDS_AUTHORIZATION",
      },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const adjustedBy = auth.user.email ?? auth.user.id;

  const { data: updatedOrder, error: updateError } = await supabaseServer
    .from("orders")
    .update({
      capture_amount_cents: captureAmountCents,
      capture_adjustment_reason: reason,
      capture_adjusted_by: adjustedBy,
      capture_adjusted_at: now,
      updated_at: now,
    })
    .eq("id", order.id)
    .select("*")
    .maybeSingle();

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message, code: "CAPTURE_ADJUSTMENT_SAVE_FAILED" },
      { status: 500 },
    );
  }

  if (!updatedOrder) {
    return NextResponse.json(
      { error: "Order not found.", code: "ORDER_NOT_FOUND" },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, order: updatedOrder });
}
