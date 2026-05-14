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
  archived?: boolean | null;
  payment_intent_id?: string | null;
};

type AbandonedOrderRow = OrderRow & {
  abandoned_checkout: AbandonedCheckoutClassification;
};

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
  if (o.archived) return false;

  // Hard rule: fulfillment/admin action queue starts after payment intent.
  if (!o.payment_intent_id) return false;
  if (o.status === "draft") return false;

  return true;
}

/* =========================
   Route
========================= */

export async function GET() {
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
      return new Response("Failed to fetch orders", { status: 500 });
    }

    const orders: OrderRow[] = (data ?? [])
      .filter((o): o is OrderRow => !!o && !!o.id && !!o.created_at)
      .map((o) => ({
        ...o,
        rx: normalizeRx(o.rx ?? null),
      }));

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

    return Response.json({
      needsAction,
      stalled,
      pipeline,
      abandoned,
    });
  } catch (err) {
    console.error("Admin route crash:", err);
    return new Response("Server error", { status: 500 });
  }
}
