import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

function checkAuth(request: Request): boolean {
  const auth = request.headers.get("authorization");
  if (!auth) return false;

  const token = auth.replace("Bearer ", "").trim();
  return token === process.env.ADMIN_PASSWORD;
}

export async function GET(request: Request) {
  if (!checkAuth(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const supabase = supabaseServer;

  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("archived", false)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }

  const now = Date.now();

  const needsAction = [];
  const stalled = [];
  const pipeline = [];

  for (const o of data ?? []) {
    const ageMin =
      o.created_at
        ? (now - new Date(o.created_at).getTime()) / 60000
        : 0;

    if (o.status === "authorized") {
      needsAction.push(o);
      continue;
    }

    if (o.status === "draft" && o.payment_intent_id && ageMin > 10) {
      stalled.push(o);
      continue;
    }

    if (o.status === "captured" || o.status === "paid") {
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