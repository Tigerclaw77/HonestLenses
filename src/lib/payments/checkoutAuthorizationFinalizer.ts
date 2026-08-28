import Stripe from "stripe";

import { sendEmail, sendVerificationInformationNeededEmail } from "@/lib/email";
import { sendFounderOperationalAlert } from "@/lib/founderAlerts";
import { getFounderVerificationAttention } from "@/lib/orders/founderVerificationAttention";
import { captureServerEvent } from "@/lib/posthog/server";
import { POSTHOG_EVENTS } from "@/lib/posthog/events";
import { supabaseServer } from "@/lib/supabase-server";
import { captureAuthorizedOrderPayment } from "@/lib/payments/legacyPaymentCommands";
import {
  getVerificationReadiness,
  VERIFICATION_INFORMATION_NEEDED_STATUS,
} from "@/lib/orders/verificationReadiness";
import {
  evaluateUploadedRxAutomation,
  runUploadedRxAutomation,
  uploadedRxReviewStatus,
  type UploadedRxAutomationDecision,
} from "@/lib/orders/uploadedRxAutomation";
import { buildCustomerOrderEmail } from "@/lib/orders/customerOrder";
import {
  checkoutAmountMatchesPaymentIntent,
  getCheckoutAmountCents,
} from "@/lib/payments/checkoutAmount";

type UnknownRecord = Record<string, unknown>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CheckoutAuthorizationResult = {
  ok: true;
  orderId: string;
  next: "success" | "verification-details";
  mode: "uploaded_auto_verified" | "uploaded_review" | "passive" | "information_needed";
  idempotent: boolean;
};

function getString(o: UnknownRecord, key: string): string | null {
  const value = o[key];
  return typeof value === "string" ? value : null;
}

function getCustomerEmail(order: UnknownRecord, fallback?: string | null) {
  const email = getString(order, "shipping_email");
  return email?.trim() ? email : fallback ?? null;
}

function getCustomerName(order: UnknownRecord): string | null {
  const name = [getString(order, "shipping_first_name"), getString(order, "shipping_last_name")]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" ")
    .trim();
  return name || null;
}

function needsCustomerPrescriptionInformation(reason: string | null): boolean {
  return [
    "missing_upload_evidence",
    "customer_confirmation_missing",
    "patient_identity_missing",
    "prescriber_missing",
    "ocr_missing_required_fields",
    "prescription_expired",
  ].includes(reason ?? "");
}

function needsPrescriberVerification(reason: string | null): boolean {
  return reason === "prescriber_mismatch";
}

/**
 * Applies the single legacy post-authorization transition. The caller must
 * have already retrieved the PaymentIntent from Stripe and verified order
 * ownership/metadata. This function never creates or captures a payment for a
 * manual-Rx order.
 */
export async function finalizeCheckoutAuthorization({
  orderRaw,
  intent,
  request,
  distinctId,
  customerEmail,
  allowAutomaticCapture = false,
}: {
  orderRaw: UnknownRecord;
  intent: Stripe.PaymentIntent;
  request?: Request;
  distinctId?: string | null;
  customerEmail?: string | null;
  /** Only the original, in-browser authorization flow may retain legacy auto-capture. */
  allowAutomaticCapture?: boolean;
}): Promise<CheckoutAuthorizationResult> {
  const orderId = getString(orderRaw, "id");
  const paymentIntentId = getString(orderRaw, "payment_intent_id");
  const orderStatus = getString(orderRaw, "status");
  const verificationStatus = getString(orderRaw, "verification_status");
  if (!orderId || !paymentIntentId || !orderStatus) {
    throw new Error("Order is missing authorization state.");
  }

  // A later redirect/recovery visit must never downgrade an already captured
  // uploaded-Rx order while Stripe reports the completed manual capture.
  if (
    orderStatus === "captured" &&
    verificationStatus === "auto_verified" &&
    getString(orderRaw, "rx_status") === "auto_verified" &&
    intent.status === "succeeded"
  ) {
    return {
      ok: true,
      orderId,
      next: "success",
      mode: "uploaded_auto_verified",
      idempotent: true,
    };
  }

  const isUploaded = Boolean(orderRaw.rx_upload_path);
  let uploadedAutomation: UploadedRxAutomationDecision | null = null;
  let uploadedCapture: { paymentIntentId: string; alreadyCaptured: boolean } | null = null;

  if (isUploaded) {
    if (allowAutomaticCapture) {
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
                | string | number | Date | null | undefined,
            },
            "uploaded-rx-automation",
          ),
      );
      uploadedAutomation = automationRun.decision;
      uploadedCapture = automationRun.capture;
    } else {
      // Redirect/recovery reconciliation intentionally performs no capture.
      uploadedAutomation = {
        decision: evaluateUploadedRxAutomation(orderRaw, intent.status),
        capture: null,
      }.decision;
    }
  }

  const uploadedAutoVerified = Boolean(uploadedAutomation?.autoVerify && uploadedCapture);
  const uploadedReviewReason = uploadedAutomation && !uploadedAutomation.autoVerify
    ? uploadedAutomation.reason
    : null;
  const uploadedNeedsCustomerInformation = isUploaded && !uploadedAutoVerified &&
    needsCustomerPrescriptionInformation(uploadedReviewReason);
  const uploadedNeedsFounderReview = isUploaded && !uploadedAutoVerified && !uploadedNeedsCustomerInformation;
  const verificationReadiness = getVerificationReadiness(orderRaw);
  const canEnterPendingVerification = verificationReadiness.canEnterPendingVerification;
  const nextVerificationStatus = isUploaded
    ? uploadedAutoVerified
      ? "auto_verified"
      : uploadedNeedsCustomerInformation
        ? VERIFICATION_INFORMATION_NEEDED_STATUS
        : "requires_review"
    : canEnterPendingVerification
      ? "pending"
      : VERIFICATION_INFORMATION_NEEDED_STATUS;
  const mode = isUploaded
    ? uploadedAutoVerified
      ? "uploaded_auto_verified"
      : "uploaded_review"
    : canEnterPendingVerification
      ? "passive"
      : "information_needed";
  const nextStatus = uploadedAutoVerified ? "captured" : "authorized";

  const founderVerificationAttention = getFounderVerificationAttention({
    orderId,
    paymentStatus: nextStatus,
    verificationStatus: nextVerificationStatus,
    shippingMethod: getString(orderRaw, "shipping_method"),
    customerName: getCustomerName(orderRaw),
    customerEmail: getCustomerEmail(orderRaw, customerEmail),
    type: uploadedNeedsFounderReview
      ? needsPrescriberVerification(uploadedReviewReason)
        ? "prescriber_verification_required"
        : "rx_review_required"
      : "verification_attention_required",
    action: uploadedNeedsFounderReview
      ? "Review the order in the secure Order Work Queue before placement."
      : "Open the secure Order Work Queue to complete prescription verification.",
  });

  const sendFounderVerificationAttention = async () => {
    if (!founderVerificationAttention) return;
    try {
      await sendFounderOperationalAlert({ orderId, ...founderVerificationAttention });
    } catch (error) {
      // The durable alert ledger records the attempt/error. A failed alert is
      // never allowed to interrupt checkout, redirect return, or webhook work.
      console.error("Founder verification-pending alert failed:", { orderId, error });
    }
  };

  if (orderStatus === nextStatus && verificationStatus === nextVerificationStatus) {
    await sendFounderVerificationAttention();
    return {
      ok: true,
      orderId,
      next: isUploaded ? "success" : "verification-details",
      mode,
      idempotent: true,
    };
  }

  const updatePayload: Record<string, unknown> = {
    status: nextStatus,
    verification_status: nextVerificationStatus,
  };
  if (isUploaded && uploadedAutomation) {
    updatePayload.rx_status = uploadedAutoVerified
      ? "auto_verified"
      : uploadedRxReviewStatus(uploadedReviewReason ?? "automation_state_update_failed");
    updatePayload.verification_passed = uploadedAutoVerified;
    updatePayload.verification_completed_at = uploadedAutoVerified ? new Date().toISOString() : null;
  }

  const { data: updatedRows, error: updateError } = await supabaseServer
    .from("orders")
    .update(updatePayload)
    .eq("id", orderId)
    .eq("payment_intent_id", paymentIntentId)
    .eq("status", orderStatus)
    .select("id");
  if (updateError) throw new Error("Unable to finalize checkout.");
  if (!updatedRows?.length) {
    // A simultaneous redirect, webhook, or browser retry may have won the
    // compare-and-set. Treat the exact desired state as a successful replay,
    // without emitting another email or alert.
    const { data: current, error: currentError } = await supabaseServer
      .from("orders")
      .select("status, verification_status")
      .eq("id", orderId)
      .eq("payment_intent_id", paymentIntentId)
      .maybeSingle();
    if (
      !currentError &&
      current?.status === nextStatus &&
      current.verification_status === nextVerificationStatus
    ) {
      await sendFounderVerificationAttention();
      return {
        ok: true,
        orderId,
        next: isUploaded ? "success" : "verification-details",
        mode,
        idempotent: true,
      };
    }
    throw new Error("Order state changed during authorization reconciliation.");
  }

  if (isUploaded && uploadedAutomation) {
    await supabaseServer.from("order_events").insert({
      order_id: orderId,
      event_type: uploadedAutoVerified
        ? "verification_uploaded_auto"
        : "verification_uploaded_exception",
      actor: "system",
      message: uploadedAutomation.reason,
      before: { status: orderStatus, verification_status: verificationStatus },
      after: {
        status: nextStatus,
        verification_status: nextVerificationStatus,
        reason: uploadedAutomation.reason,
        evidence: uploadedAutomation.evidence,
        stripe_status: intent.status,
        stripe_capture_already_completed: uploadedCapture?.alreadyCaptured ?? false,
      },
    });
  }

  // Send immediately after the durable order transition, before optional
  // analytics/customer messaging. This shared finalizer serves browser,
  // redirect-return, and verified-webhook authorization paths.
  await sendFounderVerificationAttention();

  await captureServerEvent({
    event: POSTHOG_EVENTS.PAYMENT_AUTHORIZED,
    distinctId,
    request,
    properties: {
      order_id: orderId,
      order_status_before: orderStatus,
      order_status_after: nextStatus,
      verification_mode: mode,
      order_value_cents: typeof orderRaw.total_amount_cents === "number" ? orderRaw.total_amount_cents : null,
      has_uploaded_rx: isUploaded,
      has_payment_intent: true,
      stripe_intent_status: intent.status,
      captured_immediately: uploadedAutoVerified,
      next_step: isUploaded ? "success" : "verification-details",
    },
  });
  await captureServerEvent({
    event: POSTHOG_EVENTS.ORDER_AUTHORIZED,
    distinctId,
    request,
    properties: {
      order_id: orderId,
      order_status_before: orderStatus,
      order_status_after: nextStatus,
      verification_mode: mode,
      order_value_cents: typeof orderRaw.total_amount_cents === "number" ? orderRaw.total_amount_cents : null,
      has_uploaded_rx: isUploaded,
      has_payment_intent: true,
      stripe_intent_status: intent.status,
      next_step: isUploaded ? "success" : "verification-details",
    },
  });

  try {
    if (uploadedAutoVerified) {
      await sendFounderOperationalAlert({
        orderId,
        type: "ready_to_place",
        headline: "Order ready to place with manufacturer",
        detail: "Prescription evidence was auto-verified and payment is captured. Record the manufacturer/distributor order when placed.",
      });
    }
  } catch (error) {
    console.error("Founder action-required alert failed:", error);
  }

  const recipient = getCustomerEmail(orderRaw, customerEmail);
  if (recipient) {
    try {
      if (nextVerificationStatus === VERIFICATION_INFORMATION_NEEDED_STATUS &&
          verificationStatus !== VERIFICATION_INFORMATION_NEEDED_STATUS) {
        await sendVerificationInformationNeededEmail({ to: recipient, orderId });
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
          to: recipient,
          subject: confirmation.subject,
          html: confirmation.html,
          text: confirmation.text,
          tracking: { orderId, emailType: "order_confirmation" },
        });
      }
    } catch (error) {
      console.error("Customer authorization email failed:", error);
    }
  }

  return {
    ok: true,
    orderId,
    next: isUploaded ? "success" : "verification-details",
    mode,
    idempotent: false,
  };
}

/**
 * Reconciles a Stripe-authoritative authorization without trusting browser
 * query parameters. It is used only by a verified Stripe webhook or after a
 * route has retrieved the PaymentIntent with the server's Stripe key.
 */
export async function reconcileAuthorizedPaymentIntent({
  intent,
  request,
  distinctId,
  customerEmail,
}: {
  intent: Stripe.PaymentIntent;
  request?: Request;
  distinctId?: string | null;
  customerEmail?: string | null;
}): Promise<CheckoutAuthorizationResult | null> {
  const orderId = intent.metadata?.order_id?.trim() ?? "";
  if (!UUID_PATTERN.test(orderId)) return null;
  if (intent.status !== "requires_capture" && intent.status !== "succeeded") {
    return null;
  }

  const { data: orderRaw, error } = await supabaseServer
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .eq("payment_intent_id", intent.id)
    .in("status", ["draft", "authorized", "captured"])
    .maybeSingle();
  if (error) throw error;
  if (!orderRaw || typeof orderRaw !== "object" || Array.isArray(orderRaw)) {
    return null;
  }

  const checkoutOrder = {
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
  // A mismatch must never convert a redirect return into an authorized order.
  // Do not mutate Stripe or the order in this recovery path.
  getCheckoutAmountCents(checkoutOrder);
  if (!checkoutAmountMatchesPaymentIntent(checkoutOrder, intent.amount)) {
    return null;
  }

  return finalizeCheckoutAuthorization({
    orderRaw,
    intent,
    request,
    distinctId,
    customerEmail,
  });
}
