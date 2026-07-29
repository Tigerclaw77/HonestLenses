export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import {
  sendEmail,
  sendVerificationInformationNeededEmail,
} from "../../../../lib/email";
import { supabaseServer } from "../../../../lib/supabase-server";
import { POSTHOG_EVENTS } from "@/lib/posthog/events";
import { captureServerEvent } from "@/lib/posthog/server";
import { getRequiredPaymentIntentId } from "@/lib/orders/captureReadiness";
import {
  getVerificationReadiness,
  VERIFICATION_INFORMATION_NEEDED_STATUS,
} from "@/lib/orders/verificationReadiness";
import {
  canAccessOrder,
  getOrderAccess,
  hasOrderAccessContext,
} from "@/lib/order-access";
import { buildCustomerOrderEmail } from "@/lib/orders/customerOrder";
import {
  checkoutAmountMatchesPaymentIntent,
  getCheckoutAmountCents,
} from "@/lib/payments/checkoutAmount";
import { escapeHtml } from "@/lib/email/html";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function getString(o: UnknownRecord, key: string): string | null {
  const v = o[key];
  return typeof v === "string" ? v : null;
}

function getCustomerEmail(
  order: UnknownRecord,
  fallback: string | null,
): string | null {
  const shippingEmail = getString(order, "shipping_email");
  return shippingEmail && shippingEmail.trim() ? shippingEmail : fallback;
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
    return NextResponse.json({ error: "Unable to load checkout." }, { status: 500 });
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

  if (!orderId) {
    return NextResponse.json({ error: "Order missing id" }, { status: 500 });
  }

  const paymentIntent = getRequiredPaymentIntentId(
    {
      payment_intent_id: getString(orderRaw, "payment_intent_id"),
    },
    "Missing Stripe PaymentIntent",
  );
  if (!paymentIntent.ok) {
    return NextResponse.json(
      { error: paymentIntent.error },
      { status: 400 },
    );
  }
  const paymentIntentId = paymentIntent.paymentIntentId;

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

  const checkoutAmountOrder = {
    id: orderId,
    total_amount_cents:
      typeof orderRaw.total_amount_cents === "number"
        ? orderRaw.total_amount_cents
        : null,
    feedback_credit_cents:
      typeof orderRaw.feedback_credit_cents === "number"
        ? orderRaw.feedback_credit_cents
        : null,
  };

  let checkoutAmountCents: number;
  try {
    checkoutAmountCents = getCheckoutAmountCents(checkoutAmountOrder);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Order checkout amount is invalid",
      },
      { status: 400 },
    );
  }

  if (!checkoutAmountMatchesPaymentIntent(checkoutAmountOrder, intent.amount)) {
    return NextResponse.json(
      {
        error:
          "Checkout amount changed before authorization. Refresh checkout and approve the updated total.",
        code: "CHECKOUT_AMOUNT_MISMATCH",
        expected_amount_cents: checkoutAmountCents,
      },
      { status: 409 },
    );
  }

  /* =========================
     4️⃣ Determine Upload Truth (FIXED)
  ========================= */

  const isUploaded = !!orderRaw.rx_upload_path;
  const verificationReadiness = getVerificationReadiness(orderRaw);
  const canEnterPendingVerification =
    verificationReadiness.canEnterPendingVerification;
  const nextVerificationStatus = isUploaded
    ? "pending"
    : canEnterPendingVerification
      ? "pending"
      : VERIFICATION_INFORMATION_NEEDED_STATUS;
  const verificationMode = isUploaded
    ? "uploaded"
    : canEnterPendingVerification
      ? "passive"
      : "information_needed";
  const enteringInformationNeeded =
    nextVerificationStatus === VERIFICATION_INFORMATION_NEEDED_STATUS &&
    verificationStatus !== VERIFICATION_INFORMATION_NEEDED_STATUS;

  /* =========================
     6️⃣ Update Order
  ========================= */

  const updatePayload: Record<string, unknown> = {
    status: "authorized",
    verification_status: nextVerificationStatus,
  };

  const { data: updatedRows, error: updateError } = await supabaseServer
    .from("orders")
    .update(updatePayload)
    .eq("id", orderId)
    .eq("payment_intent_id", paymentIntentId)
    .in("status", ["draft", "authorized"])
    .select("id");

  if (updateError) {
    return NextResponse.json({ error: "Unable to finalize checkout." }, { status: 500 });
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
      order_status_after: "authorized",
      verification_mode: verificationMode,
      order_value_cents:
        typeof orderRaw.total_amount_cents === "number"
          ? orderRaw.total_amount_cents
          : null,
      has_uploaded_rx: isUploaded,
      has_payment_intent: true,
      stripe_intent_status: intent.status,
      captured_immediately: false,
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
      order_status_after: "authorized",
      verification_mode: verificationMode,
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

  const customerEmail = getCustomerEmail(orderRaw, access.userEmail);

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
    const adminAlertEmail = process.env.ADMIN_ALERT_EMAIL?.trim();
    if (!adminAlertEmail) throw new Error("ADMIN_ALERT_EMAIL is required");

    await sendEmail({
      to: adminAlertEmail,
      subject: `New Honest Lenses Order ${orderId}`,
      html: `
        <h2>New Order Authorized</h2>

        <p><strong>Order ID:</strong> ${escapeHtml(orderId)}</p>
        <p><strong>Customer:</strong> ${escapeHtml(access.userId ?? "Guest checkout")}</p>
        <p><strong>Total:</strong> ${escapeHtml(total)}</p>

        <hr/>

        <h3>Prescription</h3>

        <p><strong>Left:</strong>
        ${escapeHtml(left?.sphere ?? "?")} /
        BC ${escapeHtml(left?.base_curve ?? "?")}
        (${escapeHtml(left?.coreId ?? "")})
        </p>

        <p><strong>Right:</strong>
        ${escapeHtml(right?.sphere ?? "?")} /
        BC ${escapeHtml(right?.base_curve ?? "?")}
        (${escapeHtml(right?.coreId ?? "")})
        </p>

        <p><strong>Expires:</strong> ${escapeHtml(rx?.expires ?? "Unknown")}</p>

        <hr/>

        <h3>Doctor</h3>

        <p><strong>Name:</strong> ${escapeHtml(prescriber)}</p>
        <p><strong>Phone:</strong> ${escapeHtml(prescriberPhone)}</p>

        <hr/>

        <p><strong>Mode:</strong>
        ${
          isUploaded
            ? "Upload received (review pending)"
            : canEnterPendingVerification
              ? "Passive (Verification Pending)"
              : "Verification Information Needed"
        }
        </p>

        <p><strong>Stripe Intent:</strong> ${escapeHtml(paymentIntentId)}</p>
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
      if (enteringInformationNeeded) {
        await sendVerificationInformationNeededEmail({
          to: customerEmail,
          orderId,
        });

        await supabaseServer.from("order_events").insert({
          order_id: orderId,
          event_type: "verification_information_needed",
          actor: "system",
        });
      } else {
        const confirmation = buildCustomerOrderEmail({ orderId, isUploaded });

        await sendEmail({
          to: customerEmail,
          subject: confirmation.subject,
          html: confirmation.html,
          text: confirmation.text,
          tracking: {
            orderId,
            emailType: "order_confirmation",
          },
        });
      }
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
    mode: verificationMode,
  });
}
