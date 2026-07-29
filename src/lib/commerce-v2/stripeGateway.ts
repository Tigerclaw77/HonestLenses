import Stripe from "stripe";

export type CreateIntentInput = {
  amountCents: number;
  currency: string;
  orderId: string;
  customerUserId: string | null;
};

export interface StripeGateway {
  createPaymentIntent(
    input: CreateIntentInput,
    idempotencyKey: string,
  ): Promise<Stripe.PaymentIntent>;
  retrievePaymentIntent(id: string): Promise<Stripe.PaymentIntent>;
  retrievePaymentIntentIdForCharge(chargeId: string): Promise<string | null>;
  updatePaymentIntentAmount(
    id: string,
    amountCents: number,
    orderId: string,
    idempotencyKey: string,
  ): Promise<Stripe.PaymentIntent>;
  capturePaymentIntent(
    id: string,
    amountCents: number,
    idempotencyKey: string,
  ): Promise<Stripe.PaymentIntent>;
  cancelPaymentIntent(
    id: string,
    idempotencyKey: string,
  ): Promise<Stripe.PaymentIntent>;
  refundPaymentIntent(
    id: string,
    amountCents: number | null,
    idempotencyKey: string,
  ): Promise<Stripe.Refund>;
}

export function createStripeGateway(): StripeGateway {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }

  const stripe = new Stripe(secretKey);

  return {
    createPaymentIntent(input, idempotencyKey) {
      return stripe.paymentIntents.create(
        {
          amount: input.amountCents,
          currency: input.currency.toLowerCase(),
          capture_method: "manual",
          automatic_payment_methods: { enabled: true },
          metadata: {
            order_id: input.orderId,
            customer_user_id: input.customerUserId ?? "",
            commerce_model: "v2",
          },
        },
        { idempotencyKey },
      );
    },
    retrievePaymentIntent(id) {
      return stripe.paymentIntents.retrieve(id, {
        expand: ["latest_charge"],
      });
    },
    async retrievePaymentIntentIdForCharge(chargeId) {
      const charge = await stripe.charges.retrieve(chargeId);
      if (typeof charge.payment_intent === "string") {
        return charge.payment_intent;
      }
      return charge.payment_intent?.id ?? null;
    },
    updatePaymentIntentAmount(id, amountCents, orderId, idempotencyKey) {
      return stripe.paymentIntents.update(
        id,
        {
          amount: amountCents,
          metadata: { order_id: orderId, commerce_model: "v2" },
        },
        { idempotencyKey },
      );
    },
    capturePaymentIntent(id, amountCents, idempotencyKey) {
      return stripe.paymentIntents.capture(
        id,
        { amount_to_capture: amountCents },
        { idempotencyKey },
      );
    },
    cancelPaymentIntent(id, idempotencyKey) {
      return stripe.paymentIntents.cancel(id, undefined, { idempotencyKey });
    },
    refundPaymentIntent(id, amountCents, idempotencyKey) {
      return stripe.refunds.create(
        {
          payment_intent: id,
          ...(amountCents === null ? {} : { amount: amountCents }),
        },
        { idempotencyKey },
      );
    },
  };
}
