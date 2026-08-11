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
  getLastOperationalActivity,
  groupOperationalQueueOrders,
  isMeaningfulOperationalActivityEvent,
  type ClassifiedOperationalOrder,
  type OperationalQueueIntegrityIssue,
} from "@/lib/orders/operationalQueue";
import {
  projectPaymentState,
  type PaymentLifecycleStatus,
} from "@/lib/orders/paymentState";
import { collectLatestVerificationAttempts } from "@/lib/orders/verificationAttempts";
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
  prescriber_fax?: string | null;
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
  order_quantity_adjusted_at?: string | null;
  shipping_cents?: number | null;
  shipping_method?: string | null;
  archived?: boolean | null;
  archived_at?: string | null;
  payment_intent_id?: string | null;
  payment_status?: PaymentStatus | null;
  stripe_payment_intent_status?: string | null;
  stripe_authorized_at?: string | null;
  stripe_capture_before?: string | null;
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
  verification_requested_at?: string | null;
  verification_completed_at?: string | null;
  verification_sent_at?: string | null;
  verification_phone_attempted_at?: string | null;
  verification_fax_attempted_at?: string | null;
  verification_details_submitted_at?: string | null;
  lastOperationalActivityAt?: string | null;
  lastOperationalActivityReason?: string | null;
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

type OrderEventRow = {
  order_id: string;
  event_type: string | null;
  created_at: string | null;
};

const RECENT_DRAFT_PAYMENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const STRIPE_LOOKUP_CONCURRENCY = 5;

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
      stripe_authorized_at: null,
      stripe_capture_before: null,
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
      stripe_authorized_at: null,
      stripe_capture_before: null,
      payment_status_source: "order_fallback",
    };
  }

  const createdAt = Date.parse(order.created_at);
  if (
    order.status === "draft" &&
    Number.isFinite(createdAt) &&
    Date.now() - createdAt > RECENT_DRAFT_PAYMENT_WINDOW_MS
  ) {
    const projection = projectPaymentState(order, {
      fallback: "intent_authorized",
    });

    return {
      ...order,
      payment_status: projection.status,
      stripe_payment_intent_status: null,
      stripe_authorized_at: null,
      stripe_capture_before: null,
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
    const latestCharge =
      intent.latest_charge && typeof intent.latest_charge !== "string"
        ? intent.latest_charge
        : null;
    const authorizedAtSeconds =
      intent.status === "requires_capture"
        ? latestCharge?.created ?? intent.created
        : null;
    const captureBeforeSeconds =
      intent.status === "requires_capture"
        ? latestCharge?.payment_method_details?.card?.capture_before ?? null
        : null;

    return {
      ...order,
      payment_status: projection.status,
      stripe_payment_intent_status: projection.stripePaymentIntentStatus,
      stripe_authorized_at:
        authorizedAtSeconds === null
          ? null
          : new Date(authorizedAtSeconds * 1000).toISOString(),
      stripe_capture_before:
        captureBeforeSeconds === null
          ? null
          : new Date(captureBeforeSeconds * 1000).toISOString(),
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
      stripe_authorized_at: null,
      stripe_capture_before: null,
      payment_status_source: "stripe_lookup_failed",
    };
  }
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, values.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(values[index]);
      }
    }),
  );

  return results;
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

    const { data: eventData, error: eventError } = await supabaseServer
      .from("order_events")
      .select("order_id, event_type, created_at")
      .order("created_at", { ascending: false });

    if (eventError) {
      console.warn("Admin order activity fetch failed:", eventError);
    }

    const latestEventByOrder = new Map<string, OrderEventRow>();
    for (const event of (eventData ?? []) as OrderEventRow[]) {
      if (!isMeaningfulOperationalActivityEvent(event)) continue;
      if (!latestEventByOrder.has(event.order_id)) {
        latestEventByOrder.set(event.order_id, event);
      }
    }
    const verificationAttemptsByOrder = collectLatestVerificationAttempts(
      (eventData ?? []) as OrderEventRow[],
    );

    const ordersWithActivity = baseOrders.map((order) => {
      const activity = getLastOperationalActivity(
        order,
        latestEventByOrder.get(order.id),
      );
      const verificationAttempts = verificationAttemptsByOrder.get(order.id);
      return {
        ...order,
        verification_phone_attempted_at:
          verificationAttempts?.phoneAttemptedAt ?? null,
        verification_fax_attempted_at:
          verificationAttempts?.faxAttemptedAt ?? null,
        lastOperationalActivityAt: activity.at,
        lastOperationalActivityReason: activity.reason,
      };
    });

    const orders = await mapWithConcurrency(
      ordersWithActivity,
      STRIPE_LOOKUP_CONCURRENCY,
      withPaymentStatus,
    );

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
    const founderReview: AdminOrderRow[] = groupedOrders.founder_review;
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
      founder_review: founderReview,
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
