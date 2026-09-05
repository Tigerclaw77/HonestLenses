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
};

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
  // Every caller uses the same current server facts, including checkout email.
  // This prevents partial projections from omitting safety or receipt fields.
  order = await (dependencies.loadOrder ?? (async (id) => {
    const { data, error } = await supabaseServer.from("orders").select("*").eq("id", id).single();
    if (error || !data) throw new Error("Capture order facts unavailable");
    return data as PaymentCommandOrder;
  }))(order.id);
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

  if (reason === "uploaded-rx-automation" && !evaluateUploadedRxAutomation(order, intent.status).autoVerify) {
    throw new Error("Current uploaded prescription no longer passes automatic verification");
  }

  const amountToCapture = getCaptureAmountCents(order);
  if (amountToCapture > intent.amount_capturable) throw new Error("Capture amount exceeds Stripe authorization");
  const subtotal = receiptMerchandiseSubtotal(order);
  await (dependencies.persistSubtotal ?? (async (current, value) => {
    let query = supabaseServer.from("orders").update({ subtotal_cents: value, status: "authorized" })
      .eq("id", current.id).eq("payment_intent_id", paymentIntent.paymentIntentId)
      .eq("total_amount_cents", current.total_amount_cents!);
    if (current.updated_at) query = query.eq("updated_at", current.updated_at);
    const { data, error } = await query.select("id");
    if (error || !data?.length) throw new Error("Unable to persist final receipt facts before capture");
  }))(order, subtotal);
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
