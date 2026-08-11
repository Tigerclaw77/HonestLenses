export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { canAccessOrder, getOrderAccess, hasOrderAccessContext } from "@/lib/order-access";
import { getPrescriptionHandoffStatus } from "@/lib/prescriptionHandoff";
import { getPrescriptionHandoffById } from "@/lib/server/prescriptionHandoffStore";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const access = await getOrderAccess(request);
  if (!hasOrderAccessContext(access)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  const handoff = await getPrescriptionHandoffById(id);
  if (!handoff) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data: order } = await supabaseServer
    .from("orders")
    .select("id, user_id")
    .eq("id", handoff.order_id)
    .maybeSingle();
  if (!canAccessOrder(access, order)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({
    status: getPrescriptionHandoffStatus(handoff),
    expiresAt: handoff.expires_at,
  });
}
