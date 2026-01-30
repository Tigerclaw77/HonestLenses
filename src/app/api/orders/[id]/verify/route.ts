export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "../../../../../lib/supabase-server";
import { getUserFromRequest } from "../../../../../lib/get-user-from-request";

type VerifyPayload = {
  revised_total_amount_cents?: number;
  price_reason?: string;
  verified_lens?: string;
};

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  // 1️⃣ Require authenticated user
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  // 2️⃣ Admin-only authorization
  const { data: profile, error: profileError } = await supabaseServer
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError || profile?.role !== "admin") {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403 }
    );
  }

  const { id: orderId } = await context.params;
  const body: VerifyPayload = await req.json();

  // 3️⃣ Load order (source of truth)
  const { data: order, error: orderError } = await supabaseServer
    .from("orders")
    .select(`
      id,
      total_amount_cents,
      revised_total_amount_cents,
      allow_price_increase,
      allow_price_decrease
    `)
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    return NextResponse.json(
      { error: "Order not found" },
      { status: 404 }
    );
  }

  const originalCents = order.total_amount_cents;

  const revisedCents =
    typeof body.revised_total_amount_cents === "number"
      ? body.revised_total_amount_cents
      : null;

  const priceChanged =
    revisedCents !== null && revisedCents !== originalCents;

  // 4️⃣ Enforce admin pricing constraints
  if (priceChanged) {
    if (revisedCents > originalCents && !order.allow_price_increase) {
      return NextResponse.json(
        { error: "Price increases not allowed for this order" },
        { status: 400 }
      );
    }

    if (revisedCents < originalCents && !order.allow_price_decrease) {
      return NextResponse.json(
        { error: "Price decreases not allowed for this order" },
        { status: 400 }
      );
    }
  }

  // 5️⃣ Apply verification outcome
  const { error: updateError } = await supabaseServer
    .from("orders")
    .update({
      verification_status: priceChanged ? "altered" : "verified",
      revised_total_amount_cents: priceChanged ? revisedCents : null,
      price_reason: priceChanged ? body.price_reason ?? null : null,
      verified_lens: body.verified_lens ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    verification_status: priceChanged ? "altered" : "verified",
    total_amount_cents: originalCents,
    revised_total_amount_cents: priceChanged ? revisedCents : null,
  });
}
