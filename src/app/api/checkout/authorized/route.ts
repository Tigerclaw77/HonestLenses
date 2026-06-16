export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { sendEmail } from "../../../../lib/email";
import { supabaseServer } from "../../../../lib/supabase-server";
import { POSTHOG_EVENTS } from "@/lib/posthog/events";
import { captureServerEvent } from "@/lib/posthog/server";
import { getCaptureAmountCents } from "@/lib/payments/captureAmount";
import {
  canAccessOrder,
  getOrderAccess,
  hasOrderAccessContext,
} from "@/lib/order-access";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function getString(o: UnknownRecord, key: string): string | null {
  const v = o[key];
  return typeof v === "string" ? v : null;
}

async function safeJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

/* =========================
   MAIN HANDLER
========================= */

export async function POST(req: Request) {
  /* =========================
     1️⃣ Auth
  ========================= */

  const access = await getOrderAccess(req);

  if (!hasOrderAccessContext(access)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  /* =========================
     2️⃣ Load Draft Order
  ========================= */

  // Normal path is draft; authorized is accepted for rows created before
  // /api/checkout/pay was corrected to stop advancing status early.
  const rawBody = await safeJson(req);
  const requestedOrderId = isRecord(rawBody)
    ? getString(rawBody, "orderId")
    : null;

  const baseQuery = supabaseServer
    .from("orders")
    .select("*")
    .in("status", ["draft", "authorized"]);

  const { data: orderRaw, error } = requestedOrderId
    ? await baseQuery.eq("id", requestedOrderId).maybeSingle()
    : access.guestOrderId
      ? await baseQuery.eq("id", access.guestOrderId).maybeSingle()
    : await baseQuery
        .eq("user_id", access.userId ?? "")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!orderRaw || !isRecord(orderRaw)) {
    return NextResponse.json(
      { error: "No checkout order awaiting authorization" },
      { status: 400 },
    );
  }

  if (
    !canAccessOrder(
      access,
      orderRaw as { id: string | null; user_id?: string | null },
    )
  ) {
    return NextResponse.json({ error: "Order not authorized" }, { status: 403 });
  }

  const orderId = getString(orderRaw, "id");
  const orderStatus = getString(orderRaw, "status");
  const verificationStatus = getString(orderRaw, "verification_status");
  const paymentIntentId = getString(orderRaw, "payment_intent_id");

  if (!orderId) {
    return NextResponse.json({ error: "Order missing id" }, { status: 500 });
  }

  if (!paymentIntentId) {
    return NextResponse.json(
      { error: "Missing Stripe PaymentIntent" },
      { status: 400 },
    );
  }

  /* =========================
     3️⃣ Verify Stripe Authorization
  ========================= */

  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);

  const metaOrderId =
    typeof intent.metadata?.order_id === "string"
      ? intent.metadata.order_id
      : null;

  if (metaOrderId && metaOrderId !== orderId) {
    return NextResponse.json(
      { error: "PaymentIntent does not match this order" },
      { status: 400 },
    );
  }

  if (intent.status !== "requires_capture") {
    return NextResponse.json(
      { error: `Payment not authorized (status: ${intent.status})` },
      { status: 400 },
    );
  }

  /* =========================
     4️⃣ Determine Upload Truth (FIXED)
  ========================= */

  const isUploaded = !!orderRaw.rx_upload_path;

  if (orderStatus === "authorized" && verificationStatus === "pending") {
    return NextResponse.json({
      ok: true,
      orderId,
      next: "verification-details",
      mode: "passive",
    });
  }

  console.log("UPLOAD CHECK", {
    orderId,
    rx_upload_path: orderRaw.rx_upload_path,
    isUploaded,
  });

  /* =========================
     5️⃣ Capture if Upload Flow
  ========================= */

  if (isUploaded && intent.status === "requires_capture") {
    try {
      const amountToCapture = getCaptureAmountCents({
        id: orderId,
        total_amount_cents:
          typeof orderRaw.total_amount_cents === "number"
            ? orderRaw.total_amount_cents
            : null,
        capture_amount_cents:
          typeof orderRaw.capture_amount_cents === "number"
            ? orderRaw.capture_amount_cents
            : null,
        feedback_credit_cents:
          typeof orderRaw.feedback_credit_cents === "number"
            ? orderRaw.feedback_credit_cents
            : null,
      });

      const capturedIntent = await stripe.paymentIntents.capture(intent.id, {
        amount_to_capture: amountToCapture,
      });

      console.log("Stripe capture success", {
        orderId,
        paymentIntentId: capturedIntent.id,
        status: capturedIntent.status,
        amount: capturedIntent.amount_received,
        amountToCapture,
      });
    } catch (err) {
      console.error("Stripe capture failed", {
        orderId,
        paymentIntentId,
        error: err,
      });
      return NextResponse.json(
        {
          error:
            err instanceof Error
              ? err.message
              : "Stripe capture failed",
        },
        { status: 400 },
      );
    }
  }

  /* =========================
     6️⃣ Update Order
  ========================= */

  const updatePayload: Record<string, unknown> = {
    status: isUploaded ? "captured" : "authorized",
    verification_status: isUploaded ? "auto_verified" : "pending",
  };

  const { data: updatedRows, error: updateError } = await supabaseServer
    .from("orders")
    .update(updatePayload)
    .eq("id", orderId)
    .eq("payment_intent_id", paymentIntentId)
    .in("status", ["draft", "authorized"])
    .select("id");

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (!updatedRows?.length) {
    return NextResponse.json(
      { error: "Order state update did not match any rows" },
      { status: 500 },
    );
  }

  /* =========================
     7️⃣ Email Admin
  ========================= */

  await captureServerEvent({
    event: POSTHOG_EVENTS.PAYMENT_AUTHORIZED,
    distinctId: access.distinctId,
    request: req,
    properties: {
      order_id: orderId,
      order_status_before: orderStatus,
      order_status_after: isUploaded ? "captured" : "authorized",
      verification_mode: isUploaded ? "uploaded" : "passive",
      order_value_cents:
        typeof orderRaw.total_amount_cents === "number"
          ? orderRaw.total_amount_cents
          : null,
      has_uploaded_rx: isUploaded,
      has_payment_intent: true,
      stripe_intent_status: intent.status,
      captured_immediately: isUploaded,
      next_step: isUploaded ? "success" : "verification-details",
    },
  });

  await captureServerEvent({
    event: POSTHOG_EVENTS.ORDER_AUTHORIZED,
    distinctId: access.distinctId,
    request: req,
    properties: {
      order_id: orderId,
      order_status_before: orderStatus,
      order_status_after: isUploaded ? "captured" : "authorized",
      verification_mode: isUploaded ? "uploaded" : "passive",
      order_value_cents:
        typeof orderRaw.total_amount_cents === "number"
          ? orderRaw.total_amount_cents
          : null,
      has_uploaded_rx: isUploaded,
      has_payment_intent: true,
      stripe_intent_status: intent.status,
      next_step: isUploaded ? "success" : "verification-details",
    },
  });

  if (isUploaded) {
    await captureServerEvent({
      event: POSTHOG_EVENTS.ORDER_CAPTURED,
      distinctId: access.distinctId,
      request: req,
      properties: {
        order_id: orderId,
        verification_mode: "uploaded",
        order_value_cents:
          typeof orderRaw.total_amount_cents === "number"
            ? orderRaw.total_amount_cents
            : null,
        has_uploaded_rx: true,
        has_payment_intent: true,
        capture_reason: "uploaded_rx_auto_capture",
      },
    });
  }

  const customerEmail =
    typeof orderRaw.shipping_email === "string" && orderRaw.shipping_email
      ? orderRaw.shipping_email
      : access.userEmail;

  /* =========================
     Email Admin
  ========================= */

  try {
    const total =
      typeof orderRaw.total_amount_cents === "number"
        ? `$${(orderRaw.total_amount_cents / 100).toFixed(2)}`
        : "Unknown";

    const prescriber =
      typeof orderRaw.prescriber_name === "string"
        ? orderRaw.prescriber_name
        : "Not provided";

    const prescriberPhone =
      typeof orderRaw.prescriber_phone === "string"
        ? orderRaw.prescriber_phone
        : "Not provided";

    const rx = isRecord(orderRaw.rx) ? orderRaw.rx : null;

    const left = isRecord(rx?.left) ? rx.left : null;
    const right = isRecord(rx?.right) ? rx.right : null;

    await sendEmail({
      to: "pauldriggers@aol.com",
      subject: `New Honest Lenses Order ${orderId}`,
      html: `
        <h2>New Order Authorized</h2>

        <p><strong>Order ID:</strong> ${orderId}</p>
        <p><strong>Customer:</strong> ${access.userId ?? "Guest checkout"}</p>
        <p><strong>Total:</strong> ${total}</p>

        <hr/>

        <h3>Prescription</h3>

        <p><strong>Left:</strong>
        ${left?.sphere ?? "?"} /
        BC ${left?.base_curve ?? "?"}
        (${left?.coreId ?? ""})
        </p>

        <p><strong>Right:</strong>
        ${right?.sphere ?? "?"} /
        BC ${right?.base_curve ?? "?"}
        (${right?.coreId ?? ""})
        </p>

        <p><strong>Expires:</strong> ${rx?.expires ?? "Unknown"}</p>

        <hr/>

        <h3>Doctor</h3>

        <p><strong>Name:</strong> ${prescriber}</p>
        <p><strong>Phone:</strong> ${prescriberPhone}</p>

        <hr/>

        <p><strong>Mode:</strong>
        ${isUploaded ? "Upload (Verified)" : "Passive (Verification Pending)"}
        </p>

        <p><strong>Stripe Intent:</strong> ${paymentIntentId}</p>
      `,
    });
  } catch (err) {
    console.error("Order alert email failed:", err);
  }

  /* =========================
     8️⃣ Email Customer
  ========================= */

  if (customerEmail) {
    try {
      await sendEmail({
        to: customerEmail,
        subject: "Order received — Honest Lenses",
        html: `
        <h2>Thank you for your order</h2>

        <p>Your order has been received and is now being processed.</p>

        <p><strong>Order ID:</strong> ${orderId}</p>

        <p>
        ${
          isUploaded
            ? "Your prescription has been received and verified. Your order is moving into fulfillment."
            : "We will contact your doctor to verify your prescription before shipping."
        }
        </p>

        <p>
            View your order:
            <a href="https://www.honestlenses.com/order/${orderId}">
              View Order
            </a>
        </p>

        <p>You’ll receive updates as your order progresses.</p>

        <p>— Honest Lenses</p>
      `,
      });
    } catch (err) {
      console.error("Customer confirmation email failed:", err);
    }
  }

  /* =========================
     9️⃣ Return Next Step
  ========================= */

  return NextResponse.json({
    ok: true,
    orderId,
    next: isUploaded ? "success" : "verification-details",
    mode: isUploaded ? "uploaded" : "passive",
  });
}
