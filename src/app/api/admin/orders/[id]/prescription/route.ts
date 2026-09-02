import { NextResponse } from "next/server";

import {
  adminAuthErrorResponse,
  logAdminAuthFailure,
  requireAdminUser,
} from "@/lib/admin-auth";
import { isPrescriptionAcceptanceAvailable } from "@/lib/orders/adminWorkflow";
import { getVerificationState } from "@/lib/orders/getNextAction";
import { supabaseServer } from "@/lib/supabase-server";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminUser(req);
  if (!auth.ok) {
    logAdminAuthFailure("POST /api/admin/orders/[id]/prescription", auth);
    return adminAuthErrorResponse(auth);
  }

  const { id } = await context.params;
  const { data: order, error } = await supabaseServer
    .from("orders")
    .select(
      "id, status, verification_status, verification_passed, rx_status, rx_source, rx, rx_upload_path, prescriber_name, prescriber_email, prescriber_phone",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Unable to load the order." }, { status: 500 });
  }
  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  if (getVerificationState(order).complete) {
    return NextResponse.json({ ok: true, already_done: true, order });
  }
  if (!isPrescriptionAcceptanceAvailable(order)) {
    return NextResponse.json(
      { error: "Prescription evidence or prescriber information is required." },
      { status: 409 },
    );
  }

  const completedAt = new Date().toISOString();
  const { data: updatedOrder, error: updateError } = await supabaseServer
    .from("orders")
    .update({
      verification_status: "verified",
      verification_passed: true,
      verification_completed_at: completedAt,
      updated_at: completedAt,
    })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (updateError || !updatedOrder) {
    return NextResponse.json({ error: "Unable to accept the prescription." }, { status: 500 });
  }

  const actor = auth.user.email ?? auth.user.id;
  const { error: eventError } = await supabaseServer.from("order_events").insert({
    order_id: id,
    event_type: "admin_prescription_accepted",
    actor,
    message: "Authenticated operator accepted the prescription for fulfillment.",
    before: {
      verification_status: order.verification_status,
      verification_passed: order.verification_passed,
    },
    after: { verification_status: "verified", verification_passed: true },
  });

  return NextResponse.json({
    ok: true,
    already_done: false,
    order: updatedOrder,
    event_logged: !eventError,
  });
}

export const runtime = "nodejs";
