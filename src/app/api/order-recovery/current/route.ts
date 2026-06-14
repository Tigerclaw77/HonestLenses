export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getOrderAccess } from "@/lib/order-access";
import {
  getResumeDestination,
  type RecoverableOrder,
} from "@/lib/order-recovery";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(req: Request) {
  const access = await getOrderAccess(req);

  if (!access.guestOrderId) {
    return NextResponse.json({ hasRecovery: false });
  }

  const { data: order, error } = await supabaseServer
    .from("orders")
    .select(
      `
      id,
      status,
      rx,
      rx_upload_path,
      rx_source,
      verification_status,
      payment_intent_id,
      shipping_email,
      shipping_first_name,
      shipping_last_name,
      shipping_address1,
      shipping_city,
      shipping_state,
      shipping_zip,
      sku,
      total_amount_cents
    `,
    )
    .eq("id", access.guestOrderId)
    .maybeSingle<RecoverableOrder>();

  if (error || !order) {
    return NextResponse.json({ hasRecovery: false });
  }

  const destination = getResumeDestination(order);
  if (!destination) {
    return NextResponse.json({ hasRecovery: false });
  }

  return NextResponse.json({
    hasRecovery: true,
    orderId: order.id,
    step: destination.step,
    resumeUrl: destination.path,
  });
}
