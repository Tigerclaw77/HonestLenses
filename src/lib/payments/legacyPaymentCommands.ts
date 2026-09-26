import Stripe from "stripe";
import { createHash } from "node:crypto";
import { getCaptureAmountCents } from "@/lib/payments/captureAmount";
import {
  getCaptureReadiness,
  getRequiredPaymentIntentId,
} from "@/lib/orders/captureReadiness";
import { ensureReceiptSnapshotWithoutAffectingPayment } from "@/lib/receipts/server";
import { supabaseServer } from "@/lib/supabase-server";
import { hasUnresolvedProductMismatch, type ProductEvidenceOrder } from "@/lib/orders/productSelection";
import { receiptMerchandiseSubtotal, type ReceiptOrderSource } from "@/lib/receipts/core";
import { evaluateUploadedRxAutomation } from "@/lib/orders/uploadedRxAutomation";
import type { UploadedRxProductResolutions } from "@/lib/orders/uploadedRxAutomation";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

type PaymentCommandOrder = ReceiptOrderSource & ProductEvidenceOrder & {
  id: string;
  status?: string;
  updated_at?: string;
  payment_intent_id?: string | null;
  total_amount_cents?: number | null;
  capture_amount_cents?: number | null;
  feedback_credit_cents?: number | null;
  authorization_expires_at?: string | number | Date | null;
  shipping_email?: string | null;
};

type LegacyStripeCommands = Pick<Stripe, "paymentIntents">;

type CaptureDependencies = {
  loadOrder?: (id: string) => Promise<PaymentCommandOrder>;
  persistSubtotal?: (order: PaymentCommandOrder, subtotal: number) => Promise<void>;
  stripe?: LegacyStripeCommands;
  createReceiptSnapshot?: typeof ensureReceiptSnapshotWithoutAffectingPayment;
  uploadedRxProductResolutions?: UploadedRxProductResolutions;
};

const CAPTURE_CONCURRENT_UPDATE_CODE = "capture_order_concurrent_update";
const UPLOADED_RX_NO_LONGER_ELIGIBLE_CODE =
  "uploaded_rx_no_longer_eligible";

function captureCommandError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

function captureCommandErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

function normalizedReceiptEmail(value?: string | null): string {
  const email = value?.trim().toLowerCase() ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("A verified checkout email is required before capture");
  }
  return email;
}

function receiptEmailKey(email: string): string {
  return createHash("sha256").update(email).digest("hex").slice(0, 24);
}

export type CaptureReason =
  | "active-verification"
  | "passive-verification"
  | "admin-verification"
  | "admin-operator"
  | "uploaded-rx-automation";

export type CancelReason =
  | "customer-cancel"
  | "verification-rejected"
  | "admin-quantity-change";

const CANCELLABLE_STATUSES = new Set<Stripe.PaymentIntent.Status>([
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
  "requires_capture",
]);

export async function captureAuthorizedOrderPayment(
  order: PaymentCommandOrder,
  reason: CaptureReason,
  dependencies: CaptureDependencies = {},
): Promise<{ paymentIntentId: string; alreadyCaptured: boolean }> {
  const stripeCommands = dependencies.stripe ?? stripe;
  const loadOrder = dependencies.loadOrder ?? (async (id: string) => {
    const { data, error } = await supabaseServer
      .from("orders")
      .select("*")
      .eq("id", id)
      .single();
    if (error || !data) throw new Error("Capture order facts unavailable");
    return data as PaymentCommandOrder;
  });
  // Every caller uses the same current server facts, including checkout email.
  // This prevents partial projections from omitting safety or receipt fields.
  order = await loadOrder(order.id);
  const paymentIntent = getRequiredPaymentIntentId(order);
  if (!paymentIntent.ok) throw new Error(paymentIntent.error);

  const intent = await stripeCommands.paymentIntents.retrieve(
    paymentIntent.paymentIntentId,
    { expand: ["latest_charge"] },
  );
  const charge = typeof intent.latest_charge === "object" ? intent.latest_charge : null;
  const readiness = getCaptureReadiness(order, { ...intent,
    capture_before: charge?.payment_method_details?.card?.capture_before });
  if (hasUnresolvedProductMismatch(order)) throw new Error("Product mismatch requires explicit resolution before capture");
  if (intent.id !== paymentIntent.paymentIntentId || intent.capture_method !== "manual" ||
      intent.metadata?.order_id !== order.id || intent.currency !== "usd") {
    throw new Error("PaymentIntent does not match this manual-capture order");
  }
  if (readiness.reason === "already_captured") {
    if (intent.amount_received !== getCaptureAmountCents(order)) {
      throw new Error("Captured payment does not match the approved final amount");
    }
    await (dependencies.createReceiptSnapshot ??
      ensureReceiptSnapshotWithoutAffectingPayment)(
      order.id,
      paymentIntent.paymentIntentId,
      "capture",
    );
    return {
      paymentIntentId: paymentIntent.paymentIntentId,
      alreadyCaptured: true,
    };
  }
  if (!readiness.shouldCapture) {
    throw new Error(readiness.error ?? "Payment is not capturable");
  }

  if (
    reason === "uploaded-rx-automation" &&
    !evaluateUploadedRxAutomation(
      order,
      intent.status,
      new Date(),
      dependencies.uploadedRxProductResolutions,
    ).autoVerify
  ) {
    throw captureCommandError(
      UPLOADED_RX_NO_LONGER_ELIGIBLE_CODE,
      "Current uploaded prescription no longer passes automatic verification",
    );
  }

  let subtotal = receiptMerchandiseSubtotal(order);
  const persistSubtotal = dependencies.persistSubtotal ?? (async (current, value) => {
    let query = supabaseServer.from("orders").update({ subtotal_cents: value, status: "authorized" })
      .eq("id", current.id).eq("payment_intent_id", paymentIntent.paymentIntentId)
      .eq("total_amount_cents", current.total_amount_cents!);
    if (current.updated_at) query = query.eq("updated_at", current.updated_at);
    const { data, error } = await query.select("id");
    if (error) throw new Error("Unable to persist final receipt facts before capture");
    if (!data?.length) {
      throw captureCommandError(
        CAPTURE_CONCURRENT_UPDATE_CODE,
        "Order changed while final receipt facts were being persisted",
      );
    }
  });
  try {
    await persistSubtotal(order, subtotal);
  } catch (error) {
    if (captureCommandErrorCode(error) !== CAPTURE_CONCURRENT_UPDATE_CODE) {
      throw error;
    }
    order = await loadOrder(order.id);
    if (
      hasUnresolvedProductMismatch(order) ||
      (reason === "uploaded-rx-automation" &&
        !evaluateUploadedRxAutomation(
          order,
          intent.status,
          new Date(),
          dependencies.uploadedRxProductResolutions,
        ).autoVerify)
    ) {
      throw captureCommandError(
        UPLOADED_RX_NO_LONGER_ELIGIBLE_CODE,
        "Current uploaded prescription no longer passes automatic verification",
      );
    }
    const refreshedPaymentIntent = getRequiredPaymentIntentId(order);
    if (
      !refreshedPaymentIntent.ok ||
      refreshedPaymentIntent.paymentIntentId !== paymentIntent.paymentIntentId
    ) {
      throw captureCommandError(
        CAPTURE_CONCURRENT_UPDATE_CODE,
        "Order payment facts changed before capture",
      );
    }
    subtotal = receiptMerchandiseSubtotal(order);
    await persistSubtotal(order, subtotal);
  }

  // Re-load and re-evaluate after every pre-capture write. A benign concurrent
  // authorization reconciliation may be retried above, but changed Rx,
  // product, or payment facts must still fail closed immediately before Stripe.
  order = await loadOrder(order.id);
  if (hasUnresolvedProductMismatch(order)) {
    throw new Error("Product mismatch requires explicit resolution before capture");
  }
  if (
    reason === "uploaded-rx-automation" &&
    !evaluateUploadedRxAutomation(
      order,
      intent.status,
      new Date(),
      dependencies.uploadedRxProductResolutions,
    ).autoVerify
  ) {
    throw captureCommandError(
      UPLOADED_RX_NO_LONGER_ELIGIBLE_CODE,
      "Current uploaded prescription no longer passes automatic verification",
    );
  }
  const currentPaymentIntent = getRequiredPaymentIntentId(order);
  if (
    !currentPaymentIntent.ok ||
    currentPaymentIntent.paymentIntentId !== paymentIntent.paymentIntentId
  ) {
    throw captureCommandError(
      CAPTURE_CONCURRENT_UPDATE_CODE,
      "Order payment facts changed before capture",
    );
  }
  if (receiptMerchandiseSubtotal(order) !== subtotal) {
    throw captureCommandError(
      CAPTURE_CONCURRENT_UPDATE_CODE,
      "Order total changed while final receipt facts were being persisted",
    );
  }
  const amountToCapture = getCaptureAmountCents(order);
  if (amountToCapture > intent.amount_capturable) throw new Error("Capture amount exceeds Stripe authorization");
  const receiptEmail = normalizedReceiptEmail(order.shipping_email);
  if (intent.receipt_email?.trim().toLowerCase() !== receiptEmail) {
    await stripeCommands.paymentIntents.update(
      paymentIntent.paymentIntentId,
      { receipt_email: receiptEmail },
      {
        idempotencyKey: `legacy:${order.id}:receipt-email:${receiptEmailKey(receiptEmail)}`,
      },
    );
  }
  await stripeCommands.paymentIntents.capture(
    paymentIntent.paymentIntentId,
    { amount_to_capture: amountToCapture },
    {
      idempotencyKey:
        `legacy:${order.id}:capture:${paymentIntent.paymentIntentId}:${reason}`,
    },
  );
  await (dependencies.createReceiptSnapshot ??
    ensureReceiptSnapshotWithoutAffectingPayment)(
    order.id,
    paymentIntent.paymentIntentId,
    "capture",
  );
  return {
    paymentIntentId: paymentIntent.paymentIntentId,
    alreadyCaptured: false,
  };
}

export async function cancelOrderPayment(
  {
    orderId,
    paymentIntentId,
  }: { orderId: string; paymentIntentId: string },
  reason: CancelReason,
): Promise<{ alreadyCancelled: boolean }> {
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (intent.status === "canceled") return { alreadyCancelled: true };
  if (!CANCELLABLE_STATUSES.has(intent.status)) {
    throw new Error("Payment can no longer be cancelled");
  }

  await stripe.paymentIntents.cancel(paymentIntentId, undefined, {
    idempotencyKey:
      `legacy:${orderId}:cancel:${paymentIntentId}:${reason}`,
  });
  return { alreadyCancelled: false };
}
