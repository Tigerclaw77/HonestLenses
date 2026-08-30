export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  canAccessOrder,
  getOrderAccess,
  hasOrderAccessContext,
} from "@/lib/order-access";
import { isVisionCarrierValue } from "@/lib/visionBenefits";

type CarrierOrder = {
  id: string;
  user_id: string | null;
  status: string;
};

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const access = await getOrderAccess(request);
  if (!hasOrderAccessContext(access)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: orderId } = await context.params;
  const body = await request.json().catch(() => null);
  const carrier = body?.carrier;

  if (carrier !== null && !isVisionCarrierValue(carrier)) {
    return NextResponse.json(
      { error: "Choose a supported vision plan or skip." },
      { status: 400 },
    );
  }

  const { data: order, error: orderError } = await supabaseServer
    .from("orders")
    .select("id, user_id, status")
    .eq("id", orderId)
    .single<CarrierOrder>();

  if (orderError || !order || !canAccessOrder(access, order)) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (!["draft", "pending"].includes(order.status.trim().toLowerCase())) {
    return NextResponse.json(
      { error: "Vision plan selection is locked after payment authorization." },
      { status: 409 },
    );
  }

  const { data: updated, error: updateError } = await supabaseServer
    .from("orders")
    .update({ vision_insurance_carrier: carrier })
    .eq("id", order.id)
    .in("status", ["draft", "pending"])
    .select("vision_insurance_carrier")
    .maybeSingle();

  if (updateError) {
    return NextResponse.json(
      { error: "Unable to save vision plan selection." },
      { status: 500 },
    );
  }

  if (!updated) {
    return NextResponse.json(
      { error: "Vision plan selection is locked after payment authorization." },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, carrier });
}
