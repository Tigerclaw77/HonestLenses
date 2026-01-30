export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "../../../../../lib/supabase-server";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: orderId } = await context.params;

  const { data, error } = await supabaseServer
    .from("orders")
    .update({
      verification_required: false,
    })
    .eq("id", orderId)
    .select("id");

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 },
    );
  }

  if (!data || data.length === 0) {
    return NextResponse.json(
      { error: "Order not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true });
}
