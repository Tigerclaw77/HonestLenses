import Stripe from "stripe";
import { getCaptureAmountCents } from "@/lib/payments/captureAmount";
import {
  getCaptureReadiness,
  getRequiredPaymentIntentId,
} from "@/lib/orders/captureReadiness";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

type PaymentCommandOrder = {
  id: string;
  payment_intent_id?: string | null;
  total_amount_cents?: number | null;
  capture_amount_cents?: number | null;
  feedback_credit_cents?: number | null;
  authorization_expires_at?: string | number | Date | null;
};

export type CaptureReason =
  | "active-verification"
  | "passive-verification"
  | "admin-verification"
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
): Promise<{ paymentIntentId: string; alreadyCaptured: boolean }> {
  const paymentIntent = getRequiredPaymentIntentId(order);
  if (!paymentIntent.ok) throw new Error(paymentIntent.error);

  const intent = await stripe.paymentIntents.retrieve(
    paymentIntent.paymentIntentId,
  );
  const readiness = getCaptureReadiness(order, intent);
  if (readiness.reason === "already_captured") {
    return {
      paymentIntentId: paymentIntent.paymentIntentId,
      alreadyCaptured: true,
    };
  }
  if (!readiness.shouldCapture) {
    throw new Error(readiness.error ?? "Payment is not capturable");
  }

  const amountToCapture = getCaptureAmountCents(order);
  await stripe.paymentIntents.capture(
    paymentIntent.paymentIntentId,
    { amount_to_capture: amountToCapture },
    {
      idempotencyKey:
        `legacy:${order.id}:capture:${paymentIntent.paymentIntentId}:${reason}`,
    },
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
