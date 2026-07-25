import { NextResponse } from "next/server";
import {
  adminAuthErrorResponse,
  logAdminAuthFailure,
  requireAdminUser,
} from "@/lib/admin-auth";
import { getAuthoritativeOrderQuote } from "@/lib/orders/orderPricing";
import { getCheckoutAmountCents } from "@/lib/payments/checkoutAmount";
import { getPaymentIntentAmountAction } from "@/lib/payments/paymentIntentAmount";
import { supabaseServer } from "@/lib/supabase-server";
import Stripe from "stripe";

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
  status: string;
  sku: string | null;
  shipping_method: "standard" | "express" | null;
  payment_intent_id: string | null;
  total_amount_cents: number | null;
  feedback_credit_cents: number | null;
};

function getStripe(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) throw new Error("Stripe is not configured.");
  return new Stripe(secretKey);
}

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
    .select(
      "id, status, sku, shipping_method, payment_intent_id, total_amount_cents, feedback_credit_cents",
    )
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

  if (!order.sku) {
    return NextResponse.json(
      { error: "Order is missing a priceable SKU.", code: "ORDER_SKU_MISSING" },
      { status: 400 },
    );
  }

  if (
    ["captured", "paid", "shipped", "completed", "refunded", "cancelled"].includes(
      order.status,
    )
  ) {
    return NextResponse.json(
      {
        error: "Quantity cannot be changed after payment capture.",
        code: "ORDER_ALREADY_CAPTURED",
      },
      { status: 409 },
    );
  }

  let quote;
  try {
    quote = getAuthoritativeOrderQuote({
      sku: order.sku,
      totalBoxes: totalBoxCount,
      rightBoxCount,
      leftBoxCount,
      shippingMethod: order.shipping_method,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Order pricing failed.",
        code: "ORDER_PRICING_FAILED",
      },
      { status: 400 },
    );
  }

  let amountDueCents: number;
  try {
    amountDueCents = getCheckoutAmountCents({
      id: order.id,
      total_amount_cents: quote.totalAmountCents,
      feedback_credit_cents: order.feedback_credit_cents,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Order amount is invalid.",
        code: "ORDER_AMOUNT_INVALID",
      },
      { status: 400 },
    );
  }

  let invalidatePaymentIntent = false;
  let reauthorizationRequired = false;

  if (order.payment_intent_id) {
    let intent: Stripe.PaymentIntent;
    try {
      intent = await getStripe().paymentIntents.retrieve(
        order.payment_intent_id,
      );
    } catch (error) {
      console.error("Quantity adjustment PaymentIntent lookup failed:", {
        orderId: order.id,
        paymentIntentId: order.payment_intent_id,
        error,
      });
      return NextResponse.json(
        {
          error: "Unable to verify the existing payment authorization.",
          code: "PAYMENT_INTENT_LOOKUP_FAILED",
        },
        { status: 502 },
      );
    }

    const paymentAction = getPaymentIntentAmountAction(intent, amountDueCents);

    if (paymentAction.action === "reject_captured") {
      return NextResponse.json(
        {
          error: "Quantity cannot be changed after payment capture.",
          code: "ORDER_ALREADY_CAPTURED",
        },
        { status: 409 },
      );
    }

    if (paymentAction.action === "reject_status") {
      return NextResponse.json(
        {
          error: `Payment authorization cannot be safely replaced while Stripe status is ${paymentAction.status}.`,
          code: "PAYMENT_INTENT_NOT_REPLACEABLE",
        },
        { status: 409 },
      );
    }

    if (
      paymentAction.action === "cancel_and_replace" ||
      paymentAction.action === "replace_cancelled"
    ) {
      if (paymentAction.action === "cancel_and_replace") {
        try {
          await getStripe().paymentIntents.cancel(intent.id);
        } catch (error) {
          console.error("Quantity adjustment PaymentIntent cancel failed:", {
            orderId: order.id,
            paymentIntentId: intent.id,
            error,
          });
          return NextResponse.json(
            {
              error:
                "The existing payment authorization could not be safely cancelled.",
              code: "PAYMENT_INTENT_CANCEL_FAILED",
            },
            { status: 502 },
          );
        }
      }

      invalidatePaymentIntent = true;
      reauthorizationRequired = true;
    }
  } else if (order.status === "authorized" || order.status === "pending") {
    invalidatePaymentIntent = true;
    reauthorizationRequired = true;
  }

  const now = new Date().toISOString();
  const adjustedBy = auth.user.email ?? auth.user.id;

  const { data: updatedOrder, error: updateError } = await supabaseServer
    .from("orders")
    .update({
      adjusted_right_box_count: rightBoxCount,
      adjusted_left_box_count: leftBoxCount,
      adjusted_total_box_count: totalBoxCount,
      manufacturer: quote.manufacturer,
      shipping_method: quote.shippingMethod,
      shipping_cents: quote.shippingCents,
      total_amount_cents: quote.totalAmountCents,
      price_reason: quote.priceReason,
      capture_amount_cents: amountDueCents,
      capture_adjustment_reason: reason,
      capture_adjusted_by: adjustedBy,
      capture_adjusted_at: now,
      revised_total_amount_cents: null,
      order_quantity_adjustment_reason: reason,
      order_quantity_adjusted_by: adjustedBy,
      order_quantity_adjusted_at: now,
      ...(invalidatePaymentIntent
        ? { payment_intent_id: null, status: "draft" }
        : {}),
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

  return NextResponse.json({
    ok: true,
    order: updatedOrder,
    pricing: {
      product_subtotal_cents: quote.productSubtotalCents,
      shipping_cents: quote.shippingCents,
      total_amount_cents: quote.totalAmountCents,
      amount_due_cents: amountDueCents,
    },
    reauthorization_required: reauthorizationRequired,
  });
}
