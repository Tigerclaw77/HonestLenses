import { NextResponse } from "next/server";
import {
  adminAuthErrorResponse,
  logAdminAuthFailure,
  requireAdminUser,
} from "@/lib/admin-auth";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";

const ORDER_QUANTITY_ADJUSTMENT_REASONS = [
  "Quantity correction",
  "Customer requested change",
  "Prescription correction",
  "Inventory adjustment",
  "Other",
] as const;

type OrderQuantityAdjustmentReason =
  (typeof ORDER_QUANTITY_ADJUSTMENT_REASONS)[number];

type RequestBody = {
  order_id?: unknown;
  orderId?: unknown;
  adjusted_right_box_count?: unknown;
  adjusted_left_box_count?: unknown;
  right_box_count?: unknown;
  left_box_count?: unknown;
  reason?: unknown;
  order_quantity_adjustment_reason?: unknown;
};

type OrderRow = {
  id: string;
};

function isOrderQuantityAdjustmentReason(
  value: unknown,
): value is OrderQuantityAdjustmentReason {
  return ORDER_QUANTITY_ADJUSTMENT_REASONS.includes(
    value as OrderQuantityAdjustmentReason,
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
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
      "POST /api/admin/orders/adjust-order-quantity",
      auth,
    );
    return adminAuthErrorResponse(auth);
  }

  const body = await parseBody(req);
  const orderId = body.order_id ?? body.orderId;
  const rightBoxCount =
    body.adjusted_right_box_count ?? body.right_box_count;
  const leftBoxCount = body.adjusted_left_box_count ?? body.left_box_count;
  const reason =
    body.reason ?? body.order_quantity_adjustment_reason;

  if (typeof orderId !== "string" || !orderId.trim()) {
    return NextResponse.json(
      { error: "Order id is required.", code: "ORDER_ID_REQUIRED" },
      { status: 400 },
    );
  }

  if (!isNonNegativeInteger(rightBoxCount)) {
    return NextResponse.json(
      {
        error: "Right eye boxes must be an integer greater than or equal to 0.",
        code: "INVALID_RIGHT_BOX_COUNT",
      },
      { status: 400 },
    );
  }

  if (!isNonNegativeInteger(leftBoxCount)) {
    return NextResponse.json(
      {
        error: "Left eye boxes must be an integer greater than or equal to 0.",
        code: "INVALID_LEFT_BOX_COUNT",
      },
      { status: 400 },
    );
  }

  const totalBoxCount = rightBoxCount + leftBoxCount;
  if (totalBoxCount <= 0) {
    return NextResponse.json(
      {
        error: "Corrected order quantity must be at least 1 box.",
        code: "INVALID_TOTAL_BOX_COUNT",
      },
      { status: 400 },
    );
  }

  if (!isOrderQuantityAdjustmentReason(reason)) {
    return NextResponse.json(
      {
        error: "Select a valid order quantity adjustment reason.",
        code: "INVALID_ORDER_QUANTITY_REASON",
      },
      { status: 400 },
    );
  }

  const { data: order, error: orderError } = await supabaseServer
    .from("orders")
    .select("id")
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

  const now = new Date().toISOString();
  const adjustedBy = auth.user.email ?? auth.user.id;

  const { data: updatedOrder, error: updateError } = await supabaseServer
    .from("orders")
    .update({
      adjusted_right_box_count: rightBoxCount,
      adjusted_left_box_count: leftBoxCount,
      adjusted_total_box_count: totalBoxCount,
      order_quantity_adjustment_reason: reason,
      order_quantity_adjusted_by: adjustedBy,
      order_quantity_adjusted_at: now,
      updated_at: now,
    })
    .eq("id", order.id)
    .select("*")
    .maybeSingle();

  if (updateError) {
    return NextResponse.json(
      {
        error: updateError.message,
        code: "ORDER_QUANTITY_ADJUSTMENT_SAVE_FAILED",
      },
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
