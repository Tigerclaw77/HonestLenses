import Stripe from "stripe";
import type {
  PaymentLifecycleStatus,
  PaymentProjection,
} from "./types";

function unixSecondsToIso(value: number | null | undefined): string | null {
  return typeof value === "number"
    ? new Date(value * 1000).toISOString()
    : null;
}

function asExpandedCharge(
  charge: string | Stripe.Charge | null,
): Stripe.Charge | null {
  return charge && typeof charge !== "string" ? charge : null;
}

function lifecycleStatus(
  intent: Stripe.PaymentIntent,
  capturedAmountCents: number,
  refundedAmountCents: number,
  disputedAmountCents: number,
): PaymentLifecycleStatus {
  if (disputedAmountCents > 0) return "disputed";
  if (
    capturedAmountCents > 0 &&
    refundedAmountCents >= capturedAmountCents
  ) {
    return "refunded";
  }
  if (refundedAmountCents > 0) return "partially_refunded";

  switch (intent.status) {
    case "requires_capture":
      return "authorized";
    case "succeeded":
      return "captured";
    case "canceled":
      return "cancelled";
    case "requires_payment_method":
      return intent.last_payment_error
        ? "failed"
        : "requires_payment_method";
    case "requires_confirmation":
      return "requires_confirmation";
    case "requires_action":
      return "requires_action";
    case "processing":
      return "processing";
    default: {
      const exhaustive: never = intent.status;
      throw new Error(`Unsupported Stripe PaymentIntent status: ${exhaustive}`);
    }
  }
}

export function projectStripePaymentIntent(
  intent: Stripe.PaymentIntent,
  previous?: Pick<
    PaymentProjection,
    "refunded_amount_cents" | "disputed_amount_cents"
  > | null,
): PaymentProjection {
  const charge = asExpandedCharge(intent.latest_charge);
  const capturedAmountCents = intent.amount_received;
  const refundedAmountCents =
    charge?.amount_refunded ?? previous?.refunded_amount_cents ?? 0;
  const disputedAmountCents = charge
    ? charge.disputed
      ? Math.max(0, charge.amount - charge.amount_refunded)
      : 0
    : (previous?.disputed_amount_cents ?? 0);
  const authorizedAt =
    intent.status === "requires_capture"
      ? unixSecondsToIso(intent.created)
      : null;
  const capturedAt =
    capturedAmountCents > 0 ? unixSecondsToIso(charge?.created) : null;
  // PaymentIntent errors do not carry a reliable failure timestamp. The
  // corresponding immutable Stripe event is the canonical occurrence time.
  const failedAt = null;

  return {
    stripe_payment_intent_id: intent.id,
    lifecycle_status: lifecycleStatus(
      intent,
      capturedAmountCents,
      refundedAmountCents,
      disputedAmountCents,
    ),
    currency: intent.currency.toUpperCase(),
    authorized_amount_cents: intent.amount,
    capturable_amount_cents: intent.amount_capturable,
    captured_amount_cents: capturedAmountCents,
    refunded_amount_cents: refundedAmountCents,
    disputed_amount_cents: disputedAmountCents,
    latest_charge_id:
      typeof intent.latest_charge === "string"
        ? intent.latest_charge
        : (intent.latest_charge?.id ?? null),
    stripe_created_at: unixSecondsToIso(intent.created),
    authorized_at: authorizedAt,
    captured_at: capturedAt,
    cancelled_at:
      intent.status === "canceled"
        ? unixSecondsToIso(intent.canceled_at)
        : null,
    failed_at: failedAt,
    failure_code: intent.last_payment_error?.code ?? null,
    failure_message: intent.last_payment_error?.message ?? null,
    cancellation_reason: intent.cancellation_reason ?? null,
    stripe_snapshot: intent as unknown as Record<string, unknown>,
  };
}

export function isEventNewer(
  incomingEventCreatedAt: string,
  currentEventCreatedAt: string | null,
): boolean {
  return (
    currentEventCreatedAt === null ||
    new Date(incomingEventCreatedAt).getTime() >=
      new Date(currentEventCreatedAt).getTime()
  );
}
