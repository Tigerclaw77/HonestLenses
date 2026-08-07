import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { hasInternalScopeAuthorization } from "@/lib/internal-auth";
import {
  cancelOrderPayment,
  captureAuthorizedOrderPayment,
} from "@/lib/payments/legacyPaymentCommands";
import { sendFounderOperationalAlert } from "@/lib/founderAlerts";

export async function POST(req: Request) {
  if (!hasInternalScopeAuthorization(req, "verification:complete")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const orderId =
    body && typeof body.orderId === "string" ? body.orderId.trim() : "";
  const result =
    body && (body.result === "verified" || body.result === "rejected")
      ? body.result
      : null;
  const notes =
    body && typeof body.notes === "string" ? body.notes.trim() : null;

  if (!orderId || !result) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { data: order } = await supabaseServer
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .single();

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (result === "verified") {
    let capture;
    try {
      capture = await captureAuthorizedOrderPayment(
        order,
        "active-verification",
      );
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Payment could not be captured.",
        },
        { status: 400 },
      );
    }

    const { data: updatedOrder, error: updateError } = await supabaseServer
      .from("orders")
      .update({
        verification_status: "verified",
        verification_completed_at: new Date().toISOString(),
        verification_method: "active",
        status: "captured",
      })
      .eq("id", orderId)
      .eq("payment_intent_id", capture.paymentIntentId)
      .select("id")
      .maybeSingle();

    if (updateError || !updatedOrder) {
      return NextResponse.json(
        {
          error:
            updateError?.message ?? "Order state update did not match any rows",
        },
        { status: 500 },
      );
    }
  }

  if (result === "rejected") {
    if (order.payment_intent_id) {
      try {
        await cancelOrderPayment(
          { orderId, paymentIntentId: order.payment_intent_id },
          "verification-rejected",
        );
      } catch {
        return NextResponse.json(
          { error: "Payment can no longer be cancelled." },
          { status: 409 },
        );
      }
    }

    const { data: updatedOrder, error: updateError } = await supabaseServer
      .from("orders")
      .update({
        verification_status: "rejected",
        verification_completed_at: new Date().toISOString(),
        status: "cancelled",
      })
      .eq("id", orderId)
      .select("id")
      .maybeSingle();

    if (updateError || !updatedOrder) {
      return NextResponse.json(
        {
          error:
            updateError?.message ?? "Order state update did not match any rows",
        },
        { status: 500 },
      );
    }
  }

  await supabaseServer.from("order_events").insert({
    order_id: orderId,
    event_type: `verification_${result}`,
    actor: "system",
    message: notes || null,
  });

  try {
    await sendFounderOperationalAlert({
      orderId,
      type: "verification_completed",
      headline:
        result === "verified"
          ? "Verification completed — ready to order"
          : "Verification rejected — founder action required",
      detail:
        result === "verified"
          ? "Prescription verification is complete and the order is ready for the next fulfillment decision."
          : "Prescription verification was rejected and the authorization was cancelled.",
      dedupeSuffix: result,
    });
  } catch (alertError) {
    console.error("Founder verification-completed alert failed:", alertError);
  }

  return NextResponse.json({ success: true });
}
