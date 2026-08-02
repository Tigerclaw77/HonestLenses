import type Stripe from "stripe";

import { getCaptureAmountCents } from "@/lib/payments/captureAmount";

export type LegacyStripeWebhookOrder = {
  id: string;
  status: string | null;
  payment_intent_id: string | null;
  total_amount_cents: number | null;
  capture_amount_cents: number | null;
  feedback_credit_cents: number | null;
};

export type LegacyStripeWebhookRepository = {
  findOrder(
    orderId: string,
    paymentIntentId: string,
  ): Promise<LegacyStripeWebhookOrder | null>;
  markCaptured(orderId: string, paymentIntentId: string): Promise<boolean>;
};

export type LegacyStripeWebhookResult = {
  processed: boolean;
  ignored: boolean;
  reason:
    | "event_not_used_by_legacy"
    | "invalid_order_reference"
    | "order_not_matched"
    | "already_current"
    | "order_not_authorized"
    | "amount_mismatch"
    | "captured";
  orderId: string | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function processLegacyStripeWebhook(
  event: Stripe.Event,
  repository: LegacyStripeWebhookRepository,
): Promise<LegacyStripeWebhookResult> {
  if (event.type !== "payment_intent.succeeded") {
    return {
      processed: false,
      ignored: true,
      reason: "event_not_used_by_legacy",
      orderId: null,
    };
  }

  const intent = event.data.object as Stripe.PaymentIntent;
  const orderId = intent.metadata?.order_id?.trim() ?? "";
  if (!UUID_PATTERN.test(orderId)) {
    return {
      processed: false,
      ignored: true,
      reason: "invalid_order_reference",
      orderId: null,
    };
  }

  const order = await repository.findOrder(orderId, intent.id);
  if (!order) {
    return {
      processed: false,
      ignored: true,
      reason: "order_not_matched",
      orderId,
    };
  }

  if (order.status === "captured" || order.status === "completed") {
    return {
      processed: false,
      ignored: false,
      reason: "already_current",
      orderId,
    };
  }

  if (order.status !== "authorized") {
    return {
      processed: false,
      ignored: true,
      reason: "order_not_authorized",
      orderId,
    };
  }

  const expectedAmount = getCaptureAmountCents(order);
  if (
    intent.currency !== "usd" ||
    intent.amount_received !== expectedAmount
  ) {
    console.error("Legacy Stripe webhook amount mismatch", {
      stripeEventId: event.id,
      paymentIntentId: intent.id,
      orderId,
      currency: intent.currency,
      amountReceived: intent.amount_received,
      expectedAmount,
    });
    return {
      processed: false,
      ignored: true,
      reason: "amount_mismatch",
      orderId,
    };
  }

  const updated = await repository.markCaptured(orderId, intent.id);
  if (!updated) {
    const current = await repository.findOrder(orderId, intent.id);
    if (current?.status === "captured" || current?.status === "completed") {
      return {
        processed: false,
        ignored: false,
        reason: "already_current",
        orderId,
      };
    }
    throw new Error("Legacy order changed before capture reconciliation");
  }

  return {
    processed: true,
    ignored: false,
    reason: "captured",
    orderId,
  };
}
