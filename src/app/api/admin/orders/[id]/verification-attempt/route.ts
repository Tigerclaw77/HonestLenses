import { NextRequest, NextResponse } from "next/server";
import {
  adminAuthErrorResponse,
  logAdminAuthFailure,
  requireAdminUser,
} from "@/lib/admin-auth";
import {
  getVerificationAttemptEventType,
  isManualVerificationAttemptMethod,
} from "@/lib/orders/verificationAttempts";
import { supabaseServer } from "@/lib/supabase-server";

type RequestBody = {
  method?: unknown;
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminUser(request);
  if (!auth.ok) {
    logAdminAuthFailure(
      "POST /api/admin/orders/[id]/verification-attempt",
      auth,
    );
    return adminAuthErrorResponse(auth);
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as RequestBody;

  if (!isManualVerificationAttemptMethod(body.method)) {
    return NextResponse.json(
      { error: "Verification attempt method must be phone or fax." },
      { status: 400 },
    );
  }

  const { data: order, error: orderError } = await supabaseServer
    .from("orders")
    .select("id, prescriber_phone, prescriber_fax")
    .eq("id", id)
    .maybeSingle();

  if (orderError) {
    return NextResponse.json(
      { error: "Unable to load the order." },
      { status: 500 },
    );
  }
  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const contact =
    body.method === "phone" ? order.prescriber_phone : order.prescriber_fax;
  if (!contact?.trim()) {
    return NextResponse.json(
      { error: `No prescriber ${body.method} is available for this order.` },
      { status: 400 },
    );
  }

  const attemptedAt = new Date().toISOString();
  const actor = auth.user.email ?? auth.user.id;
  const { error: eventError } = await supabaseServer
    .from("order_events")
    .insert({
      order_id: id,
      event_type: getVerificationAttemptEventType(body.method),
      actor,
      message: `Admin recorded a prescriber ${body.method} verification attempt.`,
      created_at: attemptedAt,
    });

  if (eventError) {
    return NextResponse.json(
      { error: "Unable to record the verification attempt." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    method: body.method,
    attempted_at: attemptedAt,
  });
}
