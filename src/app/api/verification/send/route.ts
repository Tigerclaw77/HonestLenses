export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "../../../../lib/supabase-server";
import { getUserFromRequest } from "../../../../lib/get-user-from-request";
import { sendVerificationEmail } from "../../../../lib/email";

export async function POST(req: Request) {
  try {
    /* =========================
       1️⃣ Auth
    ========================= */
    const user = await getUserFromRequest(req);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    /* =========================
       2️⃣ Load most recent pending order
    ========================= */
    const { data: order, error: orderError } = await supabaseServer
      .from("orders")
      .select(
        `
        id,
        status,
        sku,
        manufacturer,
        right_box_count,
        left_box_count,
        total_box_count,
        patient_first_name,
        patient_middle_name,
        patient_last_name,
        patient_dob,
        patient_address_line1,
        patient_address_line2,
        patient_city,
        patient_state,
        patient_zip,
        prescriber_name,
        prescriber_practice,
        prescriber_phone,
        prescriber_fax,
        prescriber_email,
        prescriber_timezone
      `,
      )
      .eq("user_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (orderError || !order) {
      return NextResponse.json(
        { error: "No pending order found" },
        { status: 400 },
      );
    }

    if (!order.prescriber_email) {
      // No email provided — skip email send.
      // You can later implement fax fallback here.
      return NextResponse.json({
        ok: true,
        passive_deadline_at: null,
      });
    }

    /* =========================
       3️⃣ Calculate passive deadline
    ========================= */

    const nowIso = new Date().toISOString();
    const prescriberTimeZone = order.prescriber_timezone || "America/Chicago";

    const { data, error: deadlineError } = await supabaseServer.rpc(
      "calculate_passive_deadline",
      {
        p_start: nowIso,
        p_timezone: prescriberTimeZone,
      },
    );

    if (deadlineError || !data) {
      return NextResponse.json(
        { error: "Passive deadline calculation failed" },
        { status: 500 },
      );
    }

    const passiveDeadline = Array.isArray(data) ? data[0] : data;

    if (!passiveDeadline) {
      return NextResponse.json(
        { error: "Invalid passive deadline" },
        { status: 500 },
      );
    }

    /* =========================
       4️⃣ Build Email Content
    ========================= */

    const fullName = [
      order.patient_first_name,
      order.patient_middle_name,
      order.patient_last_name,
    ]
      .filter(Boolean)
      .join(" ");

    const subject = `Prescription Verification Request – ${fullName} – Order ${order.id.slice(0, 8)}`;

    const deadlineDisplay = new Date(passiveDeadline).toLocaleString("en-US", {
      timeZone: prescriberTimeZone,
    });

    const textBody = `
        Prescription Verification Request

        Practice: ${order.prescriber_practice || ""}
        Prescriber: ${order.prescriber_name || ""}
        Phone: ${order.prescriber_phone || ""}
        Fax: ${order.prescriber_fax || ""}

        Patient:
        ${fullName}
        DOB: ${order.patient_dob}

        Address:
        ${order.patient_address_line1}
        ${order.patient_address_line2 || ""}
        ${order.patient_city}, ${order.patient_state} ${order.patient_zip}

        Contact Lenses Ordered:
        SKU: ${order.sku}
        Right Eye Boxes: ${order.right_box_count || 0}
        Left Eye Boxes: ${order.left_box_count || 0}

        Under the FTC Contact Lens Rule, we are requesting verification of this prescription.

        If we do not receive a response within 8 business hours as defined by the FTC Contact Lens Rule (by ${deadlineDisplay}), the prescription will be considered verified unless otherwise indicated.

        Please reply to this email to:
        • Approve as written
        • Provide corrected values
        • Deny with reason

        Honest Lenses
        Verification Department
        `;

    const htmlBody = textBody.replace(/\n/g, "<br>");

    /* =========================
       5️⃣ Send Email
    ========================= */

    const testOverride = process.env.EMAIL_OVERRIDE;

    const recipient =
      testOverride && process.env.NODE_ENV !== "production"
        ? testOverride
        : order.prescriber_email;

    await sendVerificationEmail({
      to: recipient,
      subject,
      html: htmlBody,
      text: textBody,
    });

    /* =========================
       6️⃣ Update Order
    ========================= */

    const { error: updateError } = await supabaseServer
      .from("orders")
      .update({
        verification_sent_at: nowIso,
        passive_deadline_at: passiveDeadline,
        verification_status: "pending",
        verification_method: "email",
      })
      .eq("id", order.id);

    if (updateError) {
      return NextResponse.json(
        { error: "Order update failed" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      passive_deadline_at: passiveDeadline,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Unexpected server error",
      },
      { status: 500 },
    );
  }
}
