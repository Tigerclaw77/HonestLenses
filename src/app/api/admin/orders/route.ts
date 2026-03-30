import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

function checkAuth(request: NextRequest): boolean {
  const auth = request.headers.get("authorization");
  if (!auth) return false;

  const token = auth.replace("Bearer ", "").trim();

  return token === process.env.ADMIN_PASSWORD;
}

export async function GET(request: NextRequest) {
  // 🔒 AUTH GUARD
  if (!checkAuth(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const supabase = supabaseServer;

  const { data: orders, error } = await supabase
    .from("orders")
    .select("*")
    .eq("archived", false)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("ADMIN ORDERS ERROR:", error);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }

  type OrderRow = NonNullable<typeof orders>[number];

  const now = Date.now();

  const needsAction: OrderRow[] = [];
  const stalled: OrderRow[] = [];
  const pipeline: OrderRow[] = [];

  for (const o of orders ?? []) {
    const createdAtMs = o.created_at
      ? new Date(o.created_at).getTime()
      : 0;

    const ageMin = createdAtMs
      ? (now - createdAtMs) / 60000
      : 0;

    const isAuthorized = o.status === "authorized";
    const isCaptured =
      o.status === "captured" || o.status === "paid";

    const startedCheckout =
      o.status === "draft" && !!o.payment_intent_id;

    // 🟡 NEEDS ACTION (highest priority)
    if (isAuthorized) {
      needsAction.push(o);
      continue;
    }

    // 🔴 STALLED (checkout started but dropped)
    if (startedCheckout && ageMin > 10) {
      stalled.push(o);
      continue;
    }

    // 🟢 PIPELINE (real completed / in-progress orders)
    if (isCaptured) {
      pipeline.push(o);
      continue;
    }
  }

  return NextResponse.json({
    needsAction,
    stalled,
    pipeline,
  });
}