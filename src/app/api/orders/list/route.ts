export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "../../../../lib/supabase-server";

export async function GET() {
  const { data, error } = await supabaseServer
    .from("orders")
    .select(
      `
      id,
      status,
      total_amount_cents,
      currency,
      verification_required,
      rx_data,
      created_at
      `
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ orders: data });
}
