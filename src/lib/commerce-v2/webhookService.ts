import Stripe from "stripe";

import { projectStripePaymentIntent } from "./paymentProjection";
import type { CommerceRepository } from "./repository";
import type { StripeGateway } from "./stripeGateway";

const PAYMENT_INTENT_EVENTS = new Set([
  "payment_intent.amount_capturable_updated",
  "payment_intent.canceled",
  "payment_intent.created",
  "payment_intent.payment_failed",
  "payment_intent.processing",
  "payment_intent.requires_action",
  "payment_intent.succeeded",
]);

const CHARGE_EVENTS = new Set([
  "charge.dispute.closed",
  "charge.dispute.created",
  "charge.refund.updated",
  "charge.refunded",
]);

export type StripeWebhookResult = {
  duplicate: boolean;
  ignored: boolean;
  orderId: string | null;
};

export function verifyStripeWebhook(
  rawBody: string | Buffer,
  signature: string,
  webhookSecret: string,
  stripeSecretKey = process.env.STRIPE_SECRET_KEY,
): Stripe.Event {
  if (!stripeSecretKey) throw new Error("STRIPE_SECRET_KEY is not configured");
  const stripe = new Stripe(stripeSecretKey);
  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}

function eventObject(event: Stripe.Event): Record<string, unknown> {
  return event.data.object as unknown as Record<string, unknown>;
}

function paymentIntentId(event: Stripe.Event): string | null {
  const object = eventObject(event);
  if (object.object === "payment_intent") return String(object.id);

  const reference = object.payment_intent;
  if (typeof reference === "string") return reference;
  if (
    reference &&
    typeof reference === "object" &&
    "id" in reference &&
    typeof reference.id === "string"
  ) {
    return reference.id;
  }
  return null;
}

function chargeId(event: Stripe.Event): string | null {
  const object = eventObject(event);
  if (object.object === "dispute") {
    const reference = object.charge;
    if (typeof reference === "string") return reference;
    if (
      reference &&
      typeof reference === "object" &&
      "id" in reference &&
      typeof reference.id === "string"
    ) {
      return reference.id;
    }
  }
  return null;
}

function metadataOrderReference(event: Stripe.Event): string | null {
  const object = eventObject(event);
  const metadata = object.metadata;
  if (
    metadata &&
    typeof metadata === "object" &&
    "order_id" in metadata &&
    typeof metadata.order_id === "string"
  ) {
    return metadata.order_id;
  }
  return null;
}

function isSupported(eventType: string): boolean {
  return PAYMENT_INTENT_EVENTS.has(eventType) || CHARGE_EVENTS.has(eventType);
}

export async function processStripeWebhook(
  event: Stripe.Event,
  dependencies: {
    repository: CommerceRepository;
    stripe: StripeGateway;
  },
): Promise<StripeWebhookResult> {
  const object = eventObject(event);
  const claim = await dependencies.repository.claimPaymentEvent({
    stripeEventId: event.id,
    eventType: event.type,
    stripeObjectId: typeof object.id === "string" ? object.id : null,
    stripeObjectType:
      typeof object.object === "string" ? object.object : null,
    apiVersion: event.api_version ?? null,
    livemode: event.livemode,
    occurredAt: new Date(event.created * 1000).toISOString(),
    payload: event as unknown as Record<string, unknown>,
  });

  if (claim === "duplicate") {
    return { duplicate: true, ignored: false, orderId: null };
  }

  if (!isSupported(event.type)) {
    await dependencies.repository.finishPaymentEvent(event.id, "ignored");
    return { duplicate: false, ignored: true, orderId: null };
  }

  try {
    const directIntentId = paymentIntentId(event);
    const intentId =
      directIntentId ??
      (chargeId(event)
        ? await dependencies.stripe.retrievePaymentIntentIdForCharge(
            chargeId(event)!,
          )
        : null);
    if (!intentId) {
      await dependencies.repository.finishPaymentEvent(
        event.id,
        "ignored",
        "Event has no PaymentIntent reference",
      );
      return { duplicate: false, ignored: true, orderId: null };
    }

    const knownPayment =
      await dependencies.repository.getPaymentByIntentId(intentId);
    const metadataReference = metadataOrderReference(event);
    const orderId =
      knownPayment?.order_id ??
      (await dependencies.repository.resolveOrderReference(metadataReference));

    if (!orderId) {
      await dependencies.repository.finishPaymentEvent(
        event.id,
        "ignored",
        "PaymentIntent could not be linked to a v2 order",
      );
      return { duplicate: false, ignored: true, orderId: null };
    }

    // Fetch current Stripe state instead of trusting event order or partial
    // event payloads. The database function also rejects older projections.
    const intent = await dependencies.stripe.retrievePaymentIntent(intentId);
    const projectionObservedAt = new Date().toISOString();
    await dependencies.repository.applyPaymentProjection({
      orderId,
      projection: projectStripePaymentIntent(intent, knownPayment),
      stripeEventId: event.id,
      stripeEventCreatedAt: new Date(event.created * 1000).toISOString(),
      projectionObservedAt,
    });
    await dependencies.repository.recordOrderEvent({
      orderId,
      eventType: event.type,
      actorType: "webhook",
      actorId: event.id,
      eventData: {
        stripeEventId: event.id,
        stripePaymentIntentId: intentId,
      },
    });
    await dependencies.repository.finishPaymentEvent(event.id, "succeeded");
    return { duplicate: false, ignored: false, orderId };
  } catch (error) {
    await dependencies.repository.finishPaymentEvent(
      event.id,
      "failed",
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }
}
