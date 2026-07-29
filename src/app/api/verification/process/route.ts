import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { sendVerificationInformationNeededEmail } from "@/lib/email";
import {
  getVerificationReadiness,
  VERIFICATION_INFORMATION_NEEDED_STATUS,
} from "@/lib/orders/verificationReadiness";
import { hasInternalScopeAuthorization } from "@/lib/internal-auth";
import { captureAuthorizedOrderPayment } from "@/lib/payments/legacyPaymentCommands";

export async function POST(req: Request) {
  // ✅ 1. AUTH FIRST (before touching DB)
  if (!hasInternalScopeAuthorization(req, "verification:process")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date().toISOString();

  // ✅ 2. Then query orders
  // Current checkout leaves passive orders authorized while awaiting capture.
  // "pending" remains here for older rows from the previous lifecycle.
  const { data: orders, error } = await supabaseServer
    .from("orders")
    .select("*")
    .in("status", ["authorized", "pending"])
    .eq("verification_status", "pending")
    .lte("passive_deadline_at", now);

  if (error) {
    return NextResponse.json({ error: "Unable to load verification work." }, { status: 500 });
  }

  if (!orders?.length) {
    return NextResponse.json({ success: true });
  }

  for (const order of orders) {
    const verificationReadiness = getVerificationReadiness(order);

    if (!verificationReadiness.canEnterPendingVerification) {
      await supabaseServer
        .from("orders")
        .update({
          verification_status: VERIFICATION_INFORMATION_NEEDED_STATUS,
        })
        .eq("id", order.id)
        .eq("verification_status", "pending");

      if (order.shipping_email) {
        try {
          await sendVerificationInformationNeededEmail({
            to: order.shipping_email,
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
      continue;
    }

    if (order.rx_upload_path) continue;
    let capture;
    try {
      capture = await captureAuthorizedOrderPayment(
        order,
        "passive-verification",
      );
    } catch {
      continue;
    }

    const { data: updatedOrder, error: updateError } = await supabaseServer
      .from("orders")
      .update({
        status: "captured",
        verification_status: "verified",
        verification_passed: true,
        verification_completed_at: now,
      })
      .eq("id", order.id)
      .eq("payment_intent_id", capture.paymentIntentId)
      .select("id")
      .maybeSingle();

    if (updateError || !updatedOrder) {
      console.warn("Skipping - captured status update failed", {
        orderId: order.id,
        error: updateError?.message ?? "No order row matched",
      });
      continue;
    }

    await supabaseServer.from("order_events").insert({
      order_id: order.id,
      event_type: capture.alreadyCaptured
        ? "verification_passive_already_captured"
        : "verification_passive_auto",
      actor: "system",
    });
  }

  return NextResponse.json({ success: true });
}
