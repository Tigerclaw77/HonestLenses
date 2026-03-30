import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

function checkAuth(request: NextRequest): boolean {
  const auth = request.headers.get("authorization");
  if (!auth) return false;

  const token = auth.replace("Bearer ", "");
  return token === process.env.ADMIN_PASSWORD;
}

export async function GET(request: NextRequest) {
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
    const createdAtMs = o.created_at ? new Date(o.created_at).getTime() : 0;
    const ageMin = createdAtMs ? (now - createdAtMs) / 60000 : 0;

    if (o.status === "authorized") {
      needsAction.push(o);
      continue;
    }

    if (o.status === "draft" && o.payment_intent_id && ageMin > 10) {
      stalled.push(o);
      continue;
    }

    if (o.status === "authorized" || o.status === "captured" || o.status === "paid") {
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