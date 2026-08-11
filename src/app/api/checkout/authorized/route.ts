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
import { sendFounderOperationalAlert } from "@/lib/founderAlerts";
import {
  checkoutAmountMatchesPaymentIntent,
  getCheckoutAmountCents,
} from "@/lib/payments/checkoutAmount";
import { captureAuthorizedOrderPayment } from "@/lib/payments/legacyPaymentCommands";
import {
  runUploadedRxAutomation,
  uploadedRxReviewStatus,
  type UploadedRxAutomationDecision,
} from "@/lib/orders/uploadedRxAutomation";

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
    .in("status", ["draft", "authorized", "captured"]);

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

  if (intent.status !== "requires_capture" && intent.status !== "succeeded") {
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

  if (
    orderStatus === "captured" &&
    verificationStatus === "auto_verified" &&
    getString(orderRaw, "rx_status") === "auto_verified" &&
    intent.status === "succeeded"
  ) {
    return NextResponse.json({
      ok: true,
      orderId,
      next: "success",
      mode: "uploaded_auto_verified",
      idempotent: true,
    });
  }

  /* =========================
     4️⃣ Determine Upload Truth (FIXED)
  ========================= */

  const isUploaded = !!orderRaw.rx_upload_path;
  let uploadedAutomation: UploadedRxAutomationDecision | null = null;
  let uploadedCapture: {
    paymentIntentId: string;
    alreadyCaptured: boolean;
  } | null = null;

  if (isUploaded) {
    const automationRun = await runUploadedRxAutomation(
      orderRaw,
      intent.status,
      () =>
        captureAuthorizedOrderPayment(
          {
            id: orderId,
            payment_intent_id: paymentIntentId,
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
            authorization_expires_at: orderRaw.authorization_expires_at as
              | string
              | number
              | Date
              | null
              | undefined,
          },
          "uploaded-rx-automation",
        ),
    );
    uploadedAutomation = automationRun.decision;
    uploadedCapture = automationRun.capture;
  }

  const uploadedAutoVerified = Boolean(
    uploadedAutomation?.autoVerify && uploadedCapture,
  );
  const uploadedReviewReason =
    uploadedAutomation && !uploadedAutomation.autoVerify
      ? uploadedAutomation.reason
      : null;
  const verificationReadiness = getVerificationReadiness(orderRaw);
  const canEnterPendingVerification =
    verificationReadiness.canEnterPendingVerification;
  const nextVerificationStatus = isUploaded
    ? uploadedAutoVerified
      ? "auto_verified"
      : "pending"
    : canEnterPendingVerification
      ? "pending"
      : VERIFICATION_INFORMATION_NEEDED_STATUS;
  const verificationMode = isUploaded
    ? uploadedAutoVerified
      ? "uploaded_auto_verified"
      : "uploaded_review"
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
    status: uploadedAutoVerified ? "captured" : "authorized",
    verification_status: nextVerificationStatus,
  };
  if (isUploaded && uploadedAutomation) {
    updatePayload.rx_status = uploadedAutoVerified
      ? "auto_verified"
      : uploadedRxReviewStatus(
          uploadedReviewReason ?? "automation_state_update_failed",
        );
    updatePayload.verification_passed = uploadedAutoVerified;
    updatePayload.verification_completed_at = uploadedAutoVerified
      ? new Date().toISOString()
      : null;
  }

  const { data: updatedRows, error: updateError } = await supabaseServer
    .from("orders")
    .update(updatePayload)
    .eq("id", orderId)
    .eq("payment_intent_id", paymentIntentId)
    .in("status", ["draft", "authorized", "captured"])
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

  if (isUploaded && uploadedAutomation) {
    const { error: automationEventError } = await supabaseServer
      .from("order_events")
      .insert({
        order_id: orderId,
        event_type: uploadedAutoVerified
          ? "verification_uploaded_auto"
          : "verification_uploaded_exception",
        actor: "system",
        message: uploadedAutomation.reason,
        before: {
          status: orderStatus,
          verification_status: verificationStatus,
        },
        after: {
          status: uploadedAutoVerified ? "captured" : "authorized",
          verification_status: nextVerificationStatus,
          reason: uploadedAutomation.reason,
          evidence: uploadedAutomation.evidence,
          stripe_status: intent.status,
          stripe_capture_already_completed:
            uploadedCapture?.alreadyCaptured ?? false,
        },
      });
    if (automationEventError) {
      console.error("Uploaded-Rx automation audit event failed", {
        orderId,
        reason: uploadedAutomation.reason,
        error: automationEventError.message,
      });
    }
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
      order_status_after: uploadedAutoVerified ? "captured" : "authorized",
      verification_mode: verificationMode,
      order_value_cents:
        typeof orderRaw.total_amount_cents === "number"
          ? orderRaw.total_amount_cents
          : null,
      has_uploaded_rx: isUploaded,
      has_payment_intent: true,
      stripe_intent_status: intent.status,
      captured_immediately: uploadedAutoVerified,
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
      order_status_after: uploadedAutoVerified ? "captured" : "authorized",
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

  if (uploadedAutoVerified) {
    await captureServerEvent({
      event: POSTHOG_EVENTS.ORDER_CAPTURED,
      distinctId: access.distinctId,
      request: req,
      properties: {
        order_id: orderId,
        verification_mode: verificationMode,
        order_value_cents:
          typeof orderRaw.total_amount_cents === "number"
            ? orderRaw.total_amount_cents
            : null,
        has_uploaded_rx: true,
        has_payment_intent: true,
        capture_reason: "uploaded_rx_evidence_gate_passed",
      },
    });
  }

  const customerEmail = getCustomerEmail(orderRaw, access.userEmail);

  /* =========================
     Founder operational alert
  ========================= */

  try {
    await sendFounderOperationalAlert({
      orderId,
      type: "order_authorized",
      headline: uploadedAutoVerified
        ? "Uploaded prescription auto-verified"
        : "Order authorized",
      detail: isUploaded
        ? uploadedAutoVerified
          ? "Automated evidence checks passed, payment was captured, and the order is ready for fulfillment."
          : `Payment is authorized and the uploaded prescription needs founder review (${uploadedAutomation?.reason ?? "unknown_exception"}).`
        : canEnterPendingVerification
          ? "Payment is authorized and prescription verification is pending."
          : "Payment is authorized and customer prescription information is still required.",
    });
  } catch (err) {
    console.error("Founder authorization alert failed:", err);
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
        const confirmation = buildCustomerOrderEmail({
          orderId,
          isUploaded,
          uploadedVerificationComplete: uploadedAutoVerified,
        });

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
    uploadedRxAutomation: uploadedAutomation
      ? {
          autoVerified: uploadedAutoVerified,
          reason: uploadedAutomation.reason,
        }
      : null,
  });
}
