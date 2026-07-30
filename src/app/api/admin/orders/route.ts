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
import {
  groupOperationalQueueOrders,
  type ClassifiedOperationalOrder,
  type OperationalQueueIntegrityIssue,
} from "@/lib/orders/operationalQueue";
import {
  projectPaymentState,
  type PaymentLifecycleStatus,
} from "@/lib/orders/paymentState";
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
  verification_status?: string | null;
  rx_status?: string | null;
  sku?: string | null;
  brand?: string | null;
  rx?: RxData;
  rx_source?: string | null;
  rx_upload_path?: string | null;
  prescriber_name?: string | null;
  prescriber_email?: string | null;
  prescriber_phone?: string | null;
  shipping_email?: string | null;
  shipping_first_name?: string | null;
  shipping_last_name?: string | null;
  patient_name?: string | null;
  patient_full_name?: string | null;
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
  payment_status_source?:
    | "stripe"
    | "order_fallback"
    | "missing_intent"
    | "stripe_lookup_failed"
    | null;
  fulfillment_status?: string | null;
  email_delivery_status?: string | null;
  email_last_event?: string | null;
  email_last_event_at?: string | null;
  email_failure_reason?: string | null;
  email_delivery_requires_attention?: boolean | null;
  confirmation_email_sent_at?: string | null;
  confirmation_email_delivered_at?: string | null;
  admin_notes?: string | null;
};

type AdminOrderRow = ClassifiedOperationalOrder<OrderRow>;

type AdminQueueIntegrityIssue = OperationalQueueIntegrityIssue & {
  orderId: string;
  customerName: string;
};

type AbandonedOrderRow = OrderRow & {
  abandoned_checkout: AbandonedCheckoutClassification;
};

type PaymentStatus =
  PaymentLifecycleStatus;

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

async function withPaymentStatus(order: OrderRow): Promise<OrderRow> {
  if (!order.payment_intent_id) {
    const projection = projectPaymentState(order, {
      fallback: "intent_authorized",
    });

    return {
      ...order,
      payment_status: projection.status,
      stripe_payment_intent_status: null,
      payment_status_source: "missing_intent",
    };
  }

  if (!stripe) {
    const projection = projectPaymentState(order, {
      fallback: "intent_authorized",
    });

    return {
      ...order,
      payment_status: projection.status,
      stripe_payment_intent_status: null,
      payment_status_source: "order_fallback",
    };
  }

  try {
    const intent = await stripe.paymentIntents.retrieve(order.payment_intent_id, {
      expand: ["latest_charge"],
    });

    const projection = projectPaymentState(order, {
      stripeIntent: intent,
      fallback: "intent_authorized",
    });

    return {
      ...order,
      payment_status: projection.status,
      stripe_payment_intent_status: projection.stripePaymentIntentStatus,
      payment_status_source: "stripe",
    };
  } catch (err) {
    console.error("Admin payment status fetch failed:", {
      orderId: order.id,
      paymentIntentId: order.payment_intent_id,
      error: err,
    });

    const projection = projectPaymentState(order, {
      fallback: "intent_authorized",
    });

    return {
      ...order,
      payment_status: projection.status,
      stripe_payment_intent_status: null,
      payment_status_source: "stripe_lookup_failed",
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

    const groupedOrders = groupOperationalQueueOrders(orders);
    const awaitingVerification: AdminOrderRow[] =
      groupedOrders.awaiting_verification;
    const readyToOrder: AdminOrderRow[] = groupedOrders.ready_to_order;
    const resolveException: AdminOrderRow[] =
      groupedOrders.resolve_exception;
    const supplierManaged: AdminOrderRow[] =
      groupedOrders.supplier_managed;
    const customerBlocked: AdminOrderRow[] =
      groupedOrders.customer_blocked;
    const draftOrTest: AdminOrderRow[] = groupedOrders.draft_or_test;
    const archivedOrders: AdminOrderRow[] = [
      ...supplierManaged,
      ...customerBlocked,
      ...draftOrTest,
      ...groupedOrders.history_archive,
    ];
    const integrityIssues: AdminQueueIntegrityIssue[] = [];

    for (const order of Object.values(groupedOrders).flat()) {
      const classification = order.operational_queue;
      const customerName =
        [order.shipping_first_name, order.shipping_last_name]
          .filter(Boolean)
          .join(" ")
          .trim() ||
        order.patient_name?.trim() ||
        order.patient_full_name?.trim() ||
        order.id;

      for (const issue of classification.integrityIssues) {
        integrityIssues.push({
          ...issue,
          orderId: order.id,
          customerName,
        });
      }
    }

    return NextResponse.json({
      awaiting_verification: awaitingVerification,
      ready_to_order: readyToOrder,
      resolve_exception: resolveException,
      archive: archivedOrders,
      abandoned,
      integrity_issues: integrityIssues,
    });
  } catch (err) {
    console.error("Admin route crash:", err);
    return NextResponse.json(
      { error: "Server error", code: "SERVER_ERROR" },
      { status: 500 },
    );
  }
}
