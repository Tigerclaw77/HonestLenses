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
  status?: string;
  sku?: string | null;
  brand?: string | null;
  rx?: RxData;
  rx_upload_path?: string | null;
  prescriber_name?: string | null;
  payment_intent_id?: string | null; // 🔑 critical
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

/* =========================
   Core Filter (STRICT)
========================= */

function isActionableOrder(o: OrderRow): boolean {
  if (!o) return false;

  // 🔑 HARD RULE: must have PaymentIntent
  if (!o.payment_intent_id) return false;

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
      }))
      .filter(isActionableOrder); // 🔥 only real orders survive

    /* =========================
       Grouping (unchanged shape)
    ========================= */

    const needsAction = orders.filter(
      (o) =>
        o.status === "authorized" &&
        !o.rx_upload_path &&
        !o.prescriber_name,
    );

    const stalled = orders.filter(
      (o) =>
        o.status === "authorized" &&
        (o.rx_upload_path || o.prescriber_name),
    );

    const pipeline = orders.filter((o) => o.status !== "authorized");

    return Response.json({
      needsAction,
      stalled,
      pipeline,
    });
  } catch (err) {
    console.error("Admin route crash:", err);
    return new Response("Server error", { status: 500 });
  }
}