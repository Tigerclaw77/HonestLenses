import {
  classifyAbandonedCheckout,
  getAbandonedCheckoutThresholdHours,
  getStaleCheckoutThresholdHours,
  summarizeAbandonedReasons,
  type AbandonedCheckoutClassification,
} from "@/lib/ops/abandonedCheckout";
import { POSTHOG_EVENTS } from "@/lib/posthog/events";
import { captureServerEvent } from "@/lib/posthog/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  adminAuthErrorResponse,
  logAdminAuthFailure,
  requireAdminUser,
} from "@/lib/admin-auth";
import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

/* =========================
   Types (minimal, strict)
========================= */

type EyeRx = {
  sphere?: number | string | null;
  cyl?: number | string | null;
  axis?: number | string | null;
  add?: number | string | null;
  coreId?: string | null;
};

type RxData = {
  left?: EyeRx | null;
  right?: EyeRx | null;
} | null;

type OrderRow = {
  id: string;
  created_at: string;
  updated_at?: string | null;
  user_id?: string | null;
  status?: string;
  sku?: string | null;
  brand?: string | null;
  rx?: RxData;
  rx_source?: string | null;
  rx_upload_path?: string | null;
  prescriber_name?: string | null;
  prescriber_email?: string | null;
  prescriber_phone?: string | null;
  shipping_email?: string | null;
  total_amount_cents?: number | null;
  capture_amount_cents?: number | null;
  capture_adjustment_reason?: string | null;
  capture_adjusted_by?: string | null;
  capture_adjusted_at?: string | null;
  shipping_cents?: number | null;
  shipping_method?: string | null;
  archived?: boolean | null;
  archived_at?: string | null;
  payment_intent_id?: string | null;
  payment_status?: PaymentStatus | null;
  stripe_payment_intent_status?: string | null;
  payment_status_source?: "stripe" | "order_fallback" | "missing_intent" | null;
  fulfillment_status?: string | null;
  admin_notes?: string | null;
};

type AbandonedOrderRow = OrderRow & {
  abandoned_checkout: AbandonedCheckoutClassification;
};

type PaymentStatus =
  | "draft"
  | "authorized"
  | "captured"
  | "refunded"
  | "cancelled"
  | "failed";

/* =========================
   Helpers
========================= */

function formatDiopter(
  value: number | string | null | undefined,
): number | null {
  if (value === null || value === undefined || value === "") return null;

  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return null;

  return Number(num.toFixed(2));
}

function normalizeRx(rx: RxData): RxData {
  if (!rx) return rx;

  return {
    ...rx,
    left: rx.left
      ? {
          ...rx.left,
          sphere: formatDiopter(rx.left.sphere),
          cyl: formatDiopter(rx.left.cyl),
          add: formatDiopter(rx.left.add),
        }
      : rx.left,
    right: rx.right
      ? {
          ...rx.right,
          sphere: formatDiopter(rx.right.sphere),
          cyl: formatDiopter(rx.right.cyl),
          add: formatDiopter(rx.right.add),
        }
      : rx.right,
  };
}

function isActionableOrder(o: OrderRow): boolean {
  if (!o) return false;
  if (o.archived || o.archived_at) return false;

  // Hard rule: fulfillment/admin action queue starts after payment intent.
  if (!o.payment_intent_id) return false;
  if (o.status === "draft") return false;

  return true;
}

function fallbackPaymentStatus(order: OrderRow): PaymentStatus {
  if (order.status === "draft" && !order.payment_intent_id) return "draft";

  if (
    order.status === "captured" ||
    order.status === "paid" ||
    order.status === "shipped" ||
    order.status === "completed"
  ) {
    return "captured";
  }
  if (order.status === "refunded") return "refunded";
  if (order.status === "cancelled") return "cancelled";
  if (order.status === "failed") return "failed";
  return order.payment_intent_id ? "authorized" : "draft";
}

function statusFromStripeIntent(intent: Stripe.PaymentIntent): PaymentStatus {
  const latestCharge = intent.latest_charge;
  const charge =
    latestCharge && typeof latestCharge !== "string" ? latestCharge : null;
  const amountRefunded = charge?.amount_refunded ?? 0;

  if (charge?.refunded || amountRefunded > 0) {
    return "refunded";
  }

  if (intent.status === "succeeded") return "captured";
  if (intent.status === "requires_capture") return "authorized";
  if (intent.status === "canceled") return "cancelled";

  return "failed";
}

async function withPaymentStatus(order: OrderRow): Promise<OrderRow> {
  if (!order.payment_intent_id) {
    return {
      ...order,
      payment_status: fallbackPaymentStatus(order),
      stripe_payment_intent_status: null,
      payment_status_source: "missing_intent",
    };
  }

  if (!stripe) {
    return {
      ...order,
      payment_status: fallbackPaymentStatus(order),
      stripe_payment_intent_status: null,
      payment_status_source: "order_fallback",
    };
  }

  try {
    const intent = await stripe.paymentIntents.retrieve(order.payment_intent_id, {
      expand: ["latest_charge"],
    });

    return {
      ...order,
      payment_status: statusFromStripeIntent(intent),
      stripe_payment_intent_status: intent.status,
      payment_status_source: "stripe",
    };
  } catch (err) {
    console.error("Admin payment status fetch failed:", {
      orderId: order.id,
      paymentIntentId: order.payment_intent_id,
      error: err,
    });

    return {
      ...order,
      payment_status: fallbackPaymentStatus(order),
      stripe_payment_intent_status: null,
      payment_status_source: "order_fallback",
    };
  }
}

/* =========================
   Route
========================= */

export async function GET(req: Request) {
  const auth = await requireAdminUser(req);
  if (!auth.ok) {
    logAdminAuthFailure("GET /api/admin/orders", auth);
    return adminAuthErrorResponse(auth);
  }

  try {
    /* =========================
       Fetch orders (MOST RECENT FIRST)
    ========================= */

    const { data, error } = await supabaseServer
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Admin orders fetch error:", error);
      return NextResponse.json(
        { error: "Failed to fetch orders", code: "ORDERS_FETCH_FAILED" },
        { status: 500 },
      );
    }

    const baseOrders: OrderRow[] = (data ?? [])
      .filter((o): o is OrderRow => !!o && !!o.id && !!o.created_at)
      .map((o) => ({
        ...o,
        rx: normalizeRx(o.rx ?? null),
      }));

    const orders = await Promise.all(baseOrders.map(withPaymentStatus));

    const thresholdHours = getAbandonedCheckoutThresholdHours(
      process.env.ABANDONED_CHECKOUT_THRESHOLD_HOURS,
    );
    const staleThresholdHours = getStaleCheckoutThresholdHours(
      process.env.STALE_CHECKOUT_THRESHOLD_HOURS,
    );

    const abandoned: AbandonedOrderRow[] = orders
      .map((order) => ({
        ...order,
        abandoned_checkout: classifyAbandonedCheckout(order, {
          thresholdHours,
          staleThresholdHours,
        }),
      }))
      .filter((order): order is AbandonedOrderRow =>
        order.abandoned_checkout.isAbandoned,
      );

    if (abandoned.length > 0) {
      const reasonCounts = summarizeAbandonedReasons(
        abandoned.map((order) => order.abandoned_checkout),
      );

      await captureServerEvent({
        event: POSTHOG_EVENTS.ABANDONED_CHECKOUT_DETECTED,
        properties: {
          count: abandoned.length,
          threshold_hours: thresholdHours,
          stale_threshold_hours: staleThresholdHours,
          detection_source: "admin_orders_fetch",
          abandoned_no_payment_intent_count:
            reasonCounts.abandoned_no_payment_intent,
          abandoned_with_payment_intent_count:
            reasonCounts.abandoned_with_payment_intent,
          stale_checkout_count: reasonCounts.stale_checkout,
          incomplete_rx_count: reasonCounts.incomplete_rx,
          incomplete_doctor_info_count: reasonCounts.incomplete_doctor_info,
        },
      });
    }

    const actionableOrders = orders.filter(isActionableOrder);
    const archivedOrders = orders.filter((o) => Boolean(o.archived || o.archived_at));

    /* =========================
       Grouping (unchanged shape)
    ========================= */

    const needsAction = actionableOrders.filter(
      (o) =>
        o.status === "authorized" &&
        !o.rx_upload_path &&
        !o.prescriber_name,
    );

    const stalled = actionableOrders.filter(
      (o) =>
        o.status === "authorized" &&
        (o.rx_upload_path || o.prescriber_name),
    );

    const pipeline = actionableOrders.filter(
      (o) => o.status !== "authorized",
    );

    return NextResponse.json({
      needsAction,
      stalled,
      pipeline,
      archive: archivedOrders,
      abandoned,
    });
  } catch (err) {
    console.error("Admin route crash:", err);
    return NextResponse.json(
      { error: "Server error", code: "SERVER_ERROR" },
      { status: 500 },
    );
  }
}
