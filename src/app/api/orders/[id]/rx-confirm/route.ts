export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "../../../../../lib/supabase-server";
import {
  canAccessOrder,
  getOrderAccess,
  hasOrderAccessContext,
} from "@/lib/order-access";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: orderId } = await context.params;

  const access = await getOrderAccess(req);
  if (!hasOrderAccessContext(access)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  const { data: order, error: orderError } = await supabaseServer
    .from("orders")
    .select("id, user_id")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (!canAccessOrder(access, order)) {
    return NextResponse.json({ error: "Order not authorized" }, { status: 403 });
  }

  const expiration = new Date(body.expiration_date);
  const today = new Date();
  const isExpired = expiration < today;

  const { error } = await supabaseServer
    .from("orders")
    .update({
      rx_patient_name: body.patient_name,
      rx_dob: body.dob,
      rx_lens_brand: body.lens_brand,
      rx_expiration_date: body.expiration_date,
      rx_doctor_name: body.doctor_name,
      rx_doctor_phone: body.doctor_phone,
      rx_user_modified: true,
      rx_status: isExpired ? "expired" : "valid",
      rx_is_expired: isExpired,
    })
    .eq("id", orderId);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
