export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "../../../../lib/supabase-server";
import {
  sendVerificationEmail,
  sendVerificationInformationNeededEmail,
} from "../../../../lib/email";
import {
  getVerificationReadiness,
  VERIFICATION_INFORMATION_NEEDED_STATUS,
} from "@/lib/orders/verificationReadiness";
import {
  canAccessOrder,
  getOrderAccess,
  hasOrderAccessContext,
} from "@/lib/order-access";
import {
  enforceRateLimit,
  rateLimitErrorResponse,
} from "@/lib/security/rateLimit";
import {
  plainTextToHtml,
  sanitizeEmailHeader,
} from "@/lib/email/html";

function isVerifiedLike(v: unknown): boolean {
  if (typeof v !== "string") return false;
  return v === "verified" || v === "ocr_verified";
}

export async function POST(req: Request) {
  try {
    /* =========================
       1️⃣ Auth
    ========================= */
    const access = await getOrderAccess(req);

    if (!hasOrderAccessContext(access)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rawBody = await req.json().catch(() => null);
    const requestedOrderId =
      rawBody &&
      typeof rawBody === "object" &&
      "orderId" in rawBody &&
      typeof (rawBody as { orderId?: unknown }).orderId === "string"
        ? (rawBody as { orderId: string }).orderId
        : null;

    const rateLimit = await enforceRateLimit(req, {
      scope: "verification-email",
      identity: requestedOrderId ?? access.distinctId,
      limit: 3,
      windowSeconds: 60 * 60,
    });
    if (!rateLimit.allowed) return rateLimitErrorResponse(rateLimit);

    /* =========================
       2️⃣ Load most recent pending order
    ========================= */
    let orderQuery = supabaseServer
      .from("orders")
      .select(
        `
        id,
        user_id,
        status,
        verification_status,
        rx_status,
        rx_upload_path,
        shipping_email,
        verification_sent_at,
        passive_deadline_at,
        verification_details_submitted_at,
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
      .in("status", ["pending", "authorized"])
      .order("created_at", { ascending: false });

    if (requestedOrderId) {
      orderQuery = orderQuery.eq("id", requestedOrderId);
    } else if (access.guestOrderId) {
      orderQuery = orderQuery.eq("id", access.guestOrderId);
    } else if (access.userId) {
      orderQuery = orderQuery.eq("user_id", access.userId);
    }

    const { data: order, error: orderError } = await orderQuery
      .limit(1)
      .maybeSingle();

    if (orderError || !order) {
      return NextResponse.json(
        { error: "No pending order found" },
        { status: 400 },
      );
    }

    if (!canAccessOrder(access, order)) {
      return NextResponse.json({ error: "Order not authorized" }, { status: 403 });
    }

    // ✅ Never downgrade verified orders
    if (isVerifiedLike(order.verification_status)) {
      return NextResponse.json({
        ok: true,
        passive_deadline_at: null,
        note: "Order already verified; verification email not required.",
      });
    }

    // ✅ Prevent duplicate sends
    if (order.verification_sent_at) {
      return NextResponse.json({
        ok: true,
        passive_deadline_at: order.passive_deadline_at,
        note: "Verification already sent.",
      });
    }

    const verificationReadiness = getVerificationReadiness(order);

    if (!verificationReadiness.canEnterPendingVerification) {
      const enteringInformationNeeded =
        order.verification_status !== VERIFICATION_INFORMATION_NEEDED_STATUS;

      if (enteringInformationNeeded) {
        await supabaseServer
          .from("orders")
          .update({
            verification_status: VERIFICATION_INFORMATION_NEEDED_STATUS,
          })
          .eq("id", order.id);

        const customerEmail = order.shipping_email || access.userEmail;
        if (customerEmail) {
          try {
            await sendVerificationInformationNeededEmail({
              to: customerEmail,
              orderId: order.id,
            });
          } catch (err) {
            console.error("Verification information email failed:", err);
          }
        }

        await supabaseServer.from("order_events").insert({
          order_id: order.id,
          event_type: "verification_information_needed",
          actor: "system",
        });
      }

      return NextResponse.json({
        ok: true,
        passive_deadline_at: null,
        note: "Verification information needed before pending verification.",
      });
    }

    if (!order.prescriber_email) {
      const { error: updateError } = await supabaseServer
        .from("orders")
        .update({
          verification_status: "pending",
          verification_method: "manual_contact",
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
        passive_deadline_at: null,
        note: "Verification details collected for manual prescriber contact.",
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

    const subject = sanitizeEmailHeader(
      `Prescription Verification Request – ${fullName} – Order ${order.id.slice(0, 8)}`,
    );

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

    const htmlBody = plainTextToHtml(textBody);

    /* =========================
       5️⃣ Send Email
    ========================= */

    const recipient = order.prescriber_email;
    const { data: claimed, error: claimError } = await supabaseServer
      .from("orders")
      .update({
        verification_sent_at: nowIso,
        passive_deadline_at: passiveDeadline,
        verification_status: "pending",
        verification_method: "email",
      })
      .eq("id", order.id)
      .is("verification_sent_at", null)
      .select("id")
      .maybeSingle();

    if (claimError) {
      return NextResponse.json(
        { error: "Unable to reserve verification delivery." },
        { status: 500 },
      );
    }
    if (!claimed) {
      return NextResponse.json({
        ok: true,
        passive_deadline_at: order.passive_deadline_at,
        note: "Verification already sent.",
      });
    }

    try {
      await sendVerificationEmail({
        to: recipient,
        subject,
        html: htmlBody,
        text: textBody,
        tracking: {
          orderId: order.id,
          emailType: "verification_request",
        },
      });
    } catch (err) {
      console.error("Verification email failed:", err);
      await supabaseServer
        .from("orders")
        .update({
          verification_sent_at: null,
          passive_deadline_at: null,
          verification_method: null,
        })
        .eq("id", order.id)
        .eq("verification_sent_at", nowIso);

      return NextResponse.json(
        { error: "Failed to send verification email" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      passive_deadline_at: passiveDeadline,
    });
    } catch {
    return NextResponse.json(
      {
        error: "Unable to send verification.",
      },
      { status: 500 },
    );
  }
}
