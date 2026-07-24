import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseServer } from "@/lib/supabase-server";
import { getCaptureAmountCents } from "@/lib/payments/captureAmount";
import {
  getCaptureReadiness,
  getRequiredPaymentIntentId,
} from "@/lib/orders/captureReadiness";
import { sendVerificationInformationNeededEmail } from "@/lib/email";
import {
  getVerificationReadiness,
  VERIFICATION_INFORMATION_NEEDED_STATUS,
} from "@/lib/orders/verificationReadiness";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  // ✅ 1. AUTH FIRST (before touching DB)
  const auth = req.headers.get("authorization");

  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
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
    return NextResponse.json({ error: error.message }, { status: 500 });
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
    const paymentIntent = getRequiredPaymentIntentId(order);
    if (!paymentIntent.ok) continue;

    const intent = await stripe.paymentIntents.retrieve(
      paymentIntent.paymentIntentId,
    );
    const readiness = getCaptureReadiness(order, intent);

    if (readiness.reason === "already_captured") {
      const { data: updatedOrder, error: updateError } = await supabaseServer
        .from("orders")
        .update({
          status: "captured",
          verification_status: "verified",
          verification_passed: true,
          verification_completed_at: now,
        })
        .eq("id", order.id)
        .eq("payment_intent_id", paymentIntent.paymentIntentId)
        .select("id")
        .maybeSingle();

      if (updateError || !updatedOrder) {
        console.warn("Skipping - captured status sync failed", {
          orderId: order.id,
          error: updateError?.message ?? "No order row matched",
        });
        continue;
      }

      await supabaseServer.from("order_events").insert({
        order_id: order.id,
        event_type: "verification_passive_already_captured",
        actor: "system",
      });
      continue;
    }

    if (!readiness.canProceed) {
      console.log("Skipping - not capturable", {
        orderId: order.id,
        status: readiness.status,
      });
      continue;
    }

    let amountToCapture: number;
    try {
      amountToCapture = getCaptureAmountCents(order);
    } catch (err) {
      console.warn("Skipping - invalid capture amount", {
        orderId: order.id,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    await stripe.paymentIntents.capture(paymentIntent.paymentIntentId, {
      amount_to_capture: amountToCapture,
    });

    const { data: updatedOrder, error: updateError } = await supabaseServer
      .from("orders")
      .update({
        status: "captured",
        verification_status: "verified",
        verification_passed: true,
        verification_completed_at: now,
      })
      .eq("id", order.id)
      .eq("payment_intent_id", paymentIntent.paymentIntentId)
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
      event_type: "verification_passive_auto",
      actor: "system",
    });
  }

  return NextResponse.json({ success: true });
}
