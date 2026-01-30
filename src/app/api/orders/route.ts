export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "../../../lib/supabase-server";

export async function POST() {
  const { data, error } = await supabaseServer
    .from("orders")
    .insert({
      status: "draft",
      total_amount_cents: 0,
      currency: "USD",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ orderId: data.id });
}
