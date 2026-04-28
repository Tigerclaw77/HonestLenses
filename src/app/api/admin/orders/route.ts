import { supabaseServer } from "@/lib/supabase-server";

export async function GET() {
  try {
    /* =========================
       Fetch orders
    ========================= */

    const { data, error } = await supabaseServer
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Admin orders fetch error:", error);
      return new Response("Failed to fetch orders", { status: 500 });
    }

    /* =========================
       Basic grouping (same shape your frontend expects)
    ========================= */

    const needsAction = (data ?? []).filter(
      (o) =>
        o.status === "authorized" &&
        !o.rx_upload_path &&
        !o.prescriber_name
    );

    const stalled = (data ?? []).filter(
      (o) =>
        o.status === "authorized" &&
        (o.rx_upload_path || o.prescriber_name)
    );

    const pipeline = (data ?? []).filter(
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