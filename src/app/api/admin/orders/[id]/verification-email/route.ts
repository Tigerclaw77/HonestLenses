import { NextRequest, NextResponse } from "next/server";
import { adminAuthErrorResponse, logAdminAuthFailure, requireAdminUser } from "@/lib/admin-auth";
import { sendVerificationEmail } from "@/lib/email";
import {
  normalizePrescriberEmail,
  resendVerificationRequest,
  VERIFICATION_RESEND_COOLDOWN_MS,
  type VerificationEmailOrder,
} from "@/lib/orders/verificationEmailResend";
import { supabaseServer } from "@/lib/supabase-server";

const ORDER_FIELDS = `id, status, verification_status, passive_deadline_at,
  prescriber_name, prescriber_practice, prescriber_phone, prescriber_fax,
  prescriber_timezone, patient_first_name, patient_middle_name, patient_last_name,
  patient_dob, patient_address_line1, patient_address_line2, patient_city,
  patient_state, patient_zip, sku, right_box_count, left_box_count`;
const CLOSED_VERIFICATION_STATUSES = new Set([
  "verified", "auto_verified", "manual_verified", "ocr_verified",
  "upload_verified", "passive_verified", "doctor_confirmed", "rejected",
]);

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminUser(request);
  if (!auth.ok) {
    logAdminAuthFailure("POST /api/admin/orders/[id]/verification-email", auth);
    return adminAuthErrorResponse(auth);
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => ({})) as { prescriberEmail?: unknown };
  const email = normalizePrescriberEmail(body.prescriberEmail);
  if (!email) {
    return NextResponse.json({ error: "Enter a valid prescriber email address." }, { status: 400 });
  }

  const { data, error } = await supabaseServer.from("orders").select(ORDER_FIELDS).eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: "Unable to load the order." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  const order = data as VerificationEmailOrder;
  const verificationStatus = order.verification_status?.trim().toLowerCase() ?? "";
  if (CLOSED_VERIFICATION_STATUSES.has(verificationStatus)) {
    return NextResponse.json({ error: "Verification is already closed; no email was sent." }, { status: 409 });
  }
  if (["cancelled", "completed", "refunded"].includes(order.status?.toLowerCase() ?? "")) {
    return NextResponse.json({ error: "This order cannot be resent." }, { status: 409 });
  }

  const cooldownStart = new Date(Date.now() - VERIFICATION_RESEND_COOLDOWN_MS).toISOString();
  const { data: recent, error: recentError } = await supabaseServer
    .from("order_email_deliveries")
    .select("resend_email_id")
    .eq("order_id", id)
    .eq("email_type", "verification_request")
    .ilike("recipient", email)
    .gte("sent_at", cooldownStart)
    .limit(1)
    .maybeSingle();
  if (recentError) return NextResponse.json({ error: "Unable to verify resend safety." }, { status: 500 });
  if (recent) {
    return NextResponse.json(
      { error: "A verification email was sent to this address recently. Wait before resending." },
      { status: 429 },
    );
  }

  const actor = auth.user.email ?? auth.user.id;
  try {
    const result = await resendVerificationRequest(order, email, {
      updatePrescriberEmail: async (correctedEmail) => {
        const { error: updateError } = await supabaseServer.from("orders")
          .update({ prescriber_email: correctedEmail }).eq("id", id);
        if (updateError) throw updateError;
      },
      send: async (message) => { await sendVerificationEmail(message); },
      recordAuditEvent: async (recipient, sentAt) => {
        const { error: eventError } = await supabaseServer.from("order_events").insert({
          order_id: id,
          event_type: "verification_email_resent",
          actor,
          message: `Admin resent the prescription verification request to ${recipient}.`,
          created_at: sentAt,
        });
        if (eventError) throw eventError;
      },
    });
    return NextResponse.json({ ok: true, recipient: email, sent_at: result.sentAt });
  } catch (sendError) {
    console.error("Admin verification resend failed:", { orderId: id, error: sendError });
    return NextResponse.json({ error: "Unable to resend the verification email." }, { status: 500 });
  }
}
