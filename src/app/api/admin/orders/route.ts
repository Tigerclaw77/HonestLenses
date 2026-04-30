import { supabaseServer } from "@/lib/supabase-server";

/* =========================
   Helpers
========================= */

function formatDiopter(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;

  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return null;

  return Number(num.toFixed(2)); // store as number (e.g. -5 → -5.00)
}

function normalizeRx(rx: any) {
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

function isMeaningfulOrder(o: any) {
  if (!o) return false;

  const hasLens =
    o.sku ||
    o.brand ||
    o.rx?.left?.coreId ||
    o.rx?.right?.coreId;

  const hasRxPower =
    o.rx?.left?.sphere !== null ||
    o.rx?.right?.sphere !== null;

  return Boolean(hasLens || hasRxPower);
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

    const orders = (data ?? [])
      /* =========================
         Normalize + clean
      ========================= */
      .map((o) => ({
        ...o,
        rx: normalizeRx(o.rx),
      }))
      .filter((o) => o.id && o.created_at)
      .filter(isMeaningfulOrder); // ✅ removes "null null null" junk

    /* =========================
       Grouping
    ========================= */

    const needsAction = orders.filter(
      (o) =>
        o.status === "authorized" &&
        !o.rx_upload_path &&
        !o.prescriber_name
    );

    const stalled = orders.filter(
      (o) =>
        o.status === "authorized" &&
        (o.rx_upload_path || o.prescriber_name)
    );

    const pipeline = orders.filter(
      (o) => o.status !== "authorized"
    );

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