import type Stripe from "stripe";

import { sendEmail, sendVerificationInformationNeededEmail } from "@/lib/email";
import { hasVerificationInformationNeededNotification } from "@/lib/emailDeliveryServer";
import { sendFounderOperationalAlert } from "@/lib/founderAlerts";
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
import {
  processPostAuthorizationNotifications,
  type PostAuthorizationNotificationOrder,
} from "@/lib/orders/postAuthorizationNotifications";
import { buildCustomerOrderEmail } from "@/lib/orders/customerOrder";
import {
  ensureCustomerOrderNumber,
  getReceiptUrl,
  issueReceiptAccessToken,
} from "@/lib/receipts/server";
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
  mode:
    | "uploaded_auto_verified"
    | "uploaded_review"
    | "passive"
    | "information_needed";
  idempotent: boolean;
};

function getString(order: UnknownRecord, key: string): string | null {
  const value = order[key];
  return typeof value === "string" ? value : null;
}

function getBoolean(order: UnknownRecord, key: string): boolean {
  return order[key] === true;
}

function getCustomerEmail(order: UnknownRecord, fallback?: string | null) {
  const email = getString(order, "shipping_email");
  return email?.trim() ? email : fallback ?? null;
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

function isTerminal(order: UnknownRecord): boolean {
  return ["completed", "delivered", "cancelled", "canceled"].includes(
    getString(order, "fulfillment_status")?.trim().toLowerCase() ?? "",
  );
}

async function hasTrackedEmail(orderId: string, emailType: string) {
  if (emailType === "verification_information_needed") {
    return hasVerificationInformationNeededNotification(orderId);
  }
  const { data, error } = await supabaseServer
    .from("order_email_deliveries")
    .select("resend_email_id")
    .eq("order_id", orderId)
    .eq("email_type", emailType)
    .limit(1);
  if (error) throw error;
  return Boolean(data?.length);
}

async function sendNotifications({
  order,
  customerEmail,
  isUploaded,
  uploadedAutoVerified,
}: {
  order: PostAuthorizationNotificationOrder & UnknownRecord;
  customerEmail: string | null;
  isUploaded: boolean;
  uploadedAutoVerified: boolean;
}) {
  const recipient = getCustomerEmail(order, customerEmail);
  const notificationOrder = { ...order, shipping_email: recipient };
  const notifications = await processPostAuthorizationNotifications(
    notificationOrder,
    {
      hasCustomerNotification: hasTrackedEmail,
      sendCustomerNotification: sendVerificationInformationNeededEmail,
      async hasFounderNotification(alertKey) {
        const { data, error } = await supabaseServer
          .from("order_founder_alerts")
          .select("resend_email_id")
          .eq("alert_key", alertKey)
          .maybeSingle();
        if (error) throw error;
        return Boolean(data?.resend_email_id);
      },
      sendFounderNotification: sendFounderOperationalAlert,
    },
  );

  if (
    recipient &&
    !notifications.missingInformation &&
    !getString(order, "confirmation_email_sent_at") &&
    !(await hasTrackedEmail(order.id, "order_confirmation"))
  ) {
    const customerOrderNumber = await ensureCustomerOrderNumber(order.id);
    const receiptAccess = await issueReceiptAccessToken(order.id, "confirmation");
    const confirmation = buildCustomerOrderEmail({
      orderId: order.id,
      customerOrderNumber,
      receiptUrl: getReceiptUrl(receiptAccess.token),
      isUploaded,
      uploadedVerificationComplete: uploadedAutoVerified,
    });
    await sendEmail({
      to: recipient,
      subject: confirmation.subject,
      html: confirmation.html,
      text: confirmation.text,
      tracking: { orderId: order.id, emailType: "order_confirmation" },
      idempotencyKey: `order-confirmation:${order.id}`,
    });
  }
}

/**
 * Applies the single post-authorization transition used by the browser,
 * redirect return, and verified Stripe webhook. Only the in-browser caller is
 * allowed to retain the existing uploaded-Rx automatic capture behavior.
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
  allowAutomaticCapture?: boolean;
}): Promise<CheckoutAuthorizationResult> {
  const orderId = getString(orderRaw, "id");
  const paymentIntentId = getString(orderRaw, "payment_intent_id");
  const orderStatus = getString(orderRaw, "status");
  const verificationStatus = getString(orderRaw, "verification_status");
  if (!orderId || !paymentIntentId || !orderStatus) {
    throw new Error("Order is missing authorization state.");
  }
  if (
    getBoolean(orderRaw, "archived") ||
    Boolean(getString(orderRaw, "archived_at")) ||
    orderStatus === "completed" ||
    isTerminal(orderRaw)
  ) {
    throw new Error("Completed or archived orders cannot be finalized again.");
  }

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
  let uploadedCapture: {
    paymentIntentId: string;
    alreadyCaptured: boolean;
  } | null = null;

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
    } else {
      uploadedAutomation = evaluateUploadedRxAutomation(orderRaw, intent.status);
    }
  }

  const uploadedAutoVerified = Boolean(
    uploadedAutomation?.autoVerify && uploadedCapture,
  );
  const uploadedReviewReason =
    uploadedAutomation && !uploadedAutomation.autoVerify
      ? uploadedAutomation.reason
      : null;
  const uploadedNeedsCustomerInformation =
    isUploaded &&
    !uploadedAutoVerified &&
    needsCustomerPrescriptionInformation(uploadedReviewReason);
  const uploadedNeedsFounderReview =
    isUploaded && !uploadedAutoVerified && !uploadedNeedsCustomerInformation;
  const canEnterPendingVerification =
    getVerificationReadiness(orderRaw).canEnterPendingVerification;
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
  const nextStatus =
    uploadedAutoVerified || orderStatus === "captured" || intent.status === "succeeded"
      ? "captured"
      : "authorized";
  const effectiveOrder = {
    ...orderRaw,
    id: orderId,
    status: nextStatus,
    verification_status: nextVerificationStatus,
    customer_information_required:
      nextVerificationStatus === VERIFICATION_INFORMATION_NEEDED_STATUS,
    founder_attention_type: uploadedNeedsFounderReview
      ? needsPrescriberVerification(uploadedReviewReason)
        ? ("prescriber_verification_required" as const)
        : ("rx_review_required" as const)
      : undefined,
    founder_attention_action: uploadedNeedsFounderReview
      ? "Review the order in the secure Order Work Queue before placement."
      : undefined,
  } as PostAuthorizationNotificationOrder & UnknownRecord;

  if (orderStatus === nextStatus && verificationStatus === nextVerificationStatus) {
    try {
      await sendNotifications({
        order: effectiveOrder,
        customerEmail: customerEmail ?? null,
        isUploaded,
        uploadedAutoVerified,
      });
    } catch (error) {
      console.error("Post-authorization notification retry failed", { orderId, error });
    }
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
    .in("status", [...new Set([orderStatus, nextStatus])])
    .eq("archived", false)
    .is("archived_at", null)
    .select("id");
  if (updateError) throw new Error("Unable to finalize checkout.");
  if (!updatedRows?.length) {
    const { data: current, error: currentError } = await supabaseServer
      .from("orders")
      .select("status, verification_status, archived, archived_at")
      .eq("id", orderId)
      .eq("payment_intent_id", paymentIntentId)
      .maybeSingle();
    if (
      !currentError &&
      !current?.archived &&
      !current?.archived_at &&
      current?.status === nextStatus &&
      current.verification_status === nextVerificationStatus
    ) {
      return finalizeCheckoutAuthorization({
        orderRaw: { ...orderRaw, ...current },
        intent,
        request,
        distinctId,
        customerEmail,
        allowAutomaticCapture: false,
      });
    }
    throw new Error("Order state changed during authorization reconciliation.");
  }

  if (isUploaded && uploadedAutomation) {
    const { error } = await supabaseServer.from("order_events").insert({
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
    if (error) {
      console.error("Uploaded-Rx automation audit event failed", {
        orderId,
        error: error.message,
      });
    }
  }

  try {
    await sendNotifications({
      order: effectiveOrder,
      customerEmail: customerEmail ?? null,
      isUploaded,
      uploadedAutoVerified,
    });
  } catch (error) {
    console.error("Post-authorization notifications failed", { orderId, error });
  }

  await captureServerEvent({
    event: POSTHOG_EVENTS.PAYMENT_AUTHORIZED,
    distinctId,
    request,
    properties: {
      order_id: orderId,
      order_status_before: orderStatus,
      order_status_after: nextStatus,
      verification_mode: mode,
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
    distinctId,
    request,
    properties: {
      order_id: orderId,
      order_status_before: orderStatus,
      order_status_after: nextStatus,
      verification_mode: mode,
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
      distinctId,
      request,
      properties: {
        order_id: orderId,
        verification_mode: mode,
        order_value_cents:
          typeof orderRaw.total_amount_cents === "number"
            ? orderRaw.total_amount_cents
            : null,
        has_uploaded_rx: true,
        has_payment_intent: true,
        capture_reason: "uploaded_rx_evidence_gate_passed",
      },
    });
    try {
      await sendFounderOperationalAlert({
        orderId,
        type: "ready_to_place",
        headline: "Order ready to place with manufacturer",
        detail:
          "Prescription evidence was auto-verified and payment is captured. Record the manufacturer/distributor order when placed.",
      });
    } catch (error) {
      console.error("Founder ready-to-place alert failed", { orderId, error });
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
    .eq("archived", false)
    .is("archived_at", null)
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
