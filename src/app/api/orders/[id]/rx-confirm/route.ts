export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "../../../../../lib/supabase-server";
import { getUserFromRequest } from "../../../../../lib/get-user-from-request";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: orderId } = await context.params;

  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

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
    .eq("id", orderId)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}