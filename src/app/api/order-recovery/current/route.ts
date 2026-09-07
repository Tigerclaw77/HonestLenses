export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getOrderAccess } from "@/lib/order-access";
import {
  type RecoverableOrder,
} from "@/lib/order-recovery";
import { getVerifiedResumeDestination, RECOVERY_ORDER_FIELDS } from "@/lib/recoveryServer";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(req: Request) {
  const access = await getOrderAccess(req);

  if (!access.guestOrderId) {
    return NextResponse.json({ hasRecovery: false });
  }

  const { data: order, error } = await supabaseServer
    .from("orders")
    .select(RECOVERY_ORDER_FIELDS)
    .eq("id", access.guestOrderId)
    .maybeSingle<RecoverableOrder>();

  if (error || !order) {
    return NextResponse.json({ hasRecovery: false });
  }

  const destination = await getVerifiedResumeDestination(order).catch(() => null);
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
