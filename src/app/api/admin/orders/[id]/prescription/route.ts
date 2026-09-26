import { NextResponse } from "next/server";

import {
  adminAuthErrorResponse,
  logAdminAuthFailure,
  requireAdminUser,
} from "@/lib/admin-auth";
import { isPrescriptionAcceptanceAvailable } from "@/lib/orders/adminWorkflow";
import { getVerificationState } from "@/lib/orders/getNextAction";
import { supabaseServer } from "@/lib/supabase-server";

type PrescriptionActionBody = {
  action?: unknown;
  confirmed?: unknown;
};

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
  const body = (await req.json().catch(() => ({}))) as PrescriptionActionBody;
  if (body.action !== "accept") {
    return NextResponse.json(
      { error: "Invalid prescription action." },
      { status: 400 },
    );
  }
  if (body.confirmed !== true) {
    return NextResponse.json(
      {
        error: "Explicit operator confirmation is required.",
        code: "OPERATOR_CONFIRMATION_REQUIRED",
      },
      { status: 409 },
    );
  }

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
      {
        error: "No reviewable prescription decision is available for operator acceptance.",
        code: "PRESCRIPTION_DECISION_NOT_REVIEWABLE",
      },
      { status: 409 },
    );
  }

  const actor = auth.user.email ?? auth.user.id;
  const { data: result, error: updateError } = await supabaseServer.rpc(
    "apply_admin_prescription_acceptance",
    {
      p_order_id: id,
      p_actor: actor,
      p_confirmed: true,
    },
  );
  const outcome = result as {
    order?: typeof order;
    already_done?: boolean;
    event_logged?: boolean;
  } | null;

  if (updateError || !outcome?.order) {
    return NextResponse.json({ error: "Unable to accept the prescription." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    already_done: outcome.already_done === true,
    order: outcome.order,
    event_logged: outcome.event_logged !== false,
  });
}

export const runtime = "nodejs";
