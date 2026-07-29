import { createHash } from "node:crypto";
import type Stripe from "stripe";

import { projectStripePaymentIntent } from "./paymentProjection";
import type { CommerceRepository } from "./repository";
import type { StripeGateway } from "./stripeGateway";
import type {
  CommerceOrder,
  PaymentOperationType,
  PaymentRecord,
} from "./types";

export type CommerceMutationResult = {
  order: CommerceOrder;
  payment: PaymentRecord;
  stripePaymentIntent: Stripe.PaymentIntent;
  reused: boolean;
};

type Dependencies = {
  repository: CommerceRepository;
  stripe: StripeGateway;
  now: () => Date;
};

function stableHash(value: Record<string, unknown>): string {
  const entries = Object.entries(value).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return createHash("sha256").update(JSON.stringify(entries)).digest("hex");
}

function intentSnapshot(intent: Stripe.PaymentIntent): Record<string, unknown> {
  return intent as unknown as Record<string, unknown>;
}

function asPaymentIntent(
  value: Record<string, unknown> | null,
): Stripe.PaymentIntent | null {
  return value?.object === "payment_intent"
    ? (value as unknown as Stripe.PaymentIntent)
    : null;
}

function stripeRequestId(intent: Stripe.PaymentIntent): string | null {
  const response = (intent as Stripe.PaymentIntent & {
    lastResponse?: { requestId?: string };
  }).lastResponse;
  return response?.requestId ?? null;
}

function logicalKey(
  orderId: string,
  operation: PaymentOperationType,
  discriminator: string,
): string {
  return `commerce-v2:${orderId}:${operation}:${discriminator}`;
}

export class CommerceService {
  private readonly repository: CommerceRepository;
  private readonly stripe: StripeGateway;
  private readonly now: () => Date;

  constructor(dependencies: Dependencies) {
    this.repository = dependencies.repository;
    this.stripe = dependencies.stripe;
    this.now = dependencies.now;
  }

  async createOrReusePayment(orderId: string): Promise<CommerceMutationResult> {
    const order = await this.requireOrder(orderId);
    const existing = await this.repository.getLatestPaymentForOrder(order.id);

    if (
      existing &&
      !["cancelled", "refunded", "failed"].includes(existing.lifecycle_status)
    ) {
      const intent = await this.stripe.retrievePaymentIntent(
        existing.stripe_payment_intent_id,
      );
      const payment = await this.projectIntent(order, intent, "reuse");
      return { order, payment, stripePaymentIntent: intent, reused: true };
    }

    const key = logicalKey(order.id, "create", String(order.total_cents));
    return this.runIntentOperation({
      order,
      operationType: "create",
      idempotencyKey: key,
      payment: existing,
      request: {
        amountCents: order.total_cents,
        currency: order.currency,
      },
      mutate: () =>
        this.stripe.createPaymentIntent(
          {
            amountCents: order.total_cents,
            currency: order.currency,
            orderId: order.id,
            customerUserId: order.customer_user_id,
          },
          key,
        ),
    });
  }

  async updateAuthorizationAmount(
    orderId: string,
    amountCents: number,
  ): Promise<CommerceMutationResult> {
    const order = await this.requireOrder(orderId);
    const payment = await this.requirePayment(order.id);
    this.requirePositiveAmount(amountCents);
    if (payment.captured_amount_cents > 0) {
      throw new Error("A captured PaymentIntent amount cannot be rewritten");
    }
    const key = logicalKey(order.id, "update", String(amountCents));
    return this.runIntentOperation({
      order,
      operationType: "update",
      idempotencyKey: key,
      payment,
      request: { amountCents },
      mutate: () =>
        this.stripe.updatePaymentIntentAmount(
          payment.stripe_payment_intent_id,
          amountCents,
          order.id,
          key,
        ),
    });
  }

  async capture(
    orderId: string,
    amountCents?: number,
  ): Promise<CommerceMutationResult> {
    const order = await this.requireOrder(orderId);
    const payment = await this.requirePayment(order.id);
    const captureAmount = amountCents ?? payment.capturable_amount_cents;
    this.requirePositiveAmount(captureAmount);
    if (captureAmount > payment.capturable_amount_cents) {
      throw new Error("Capture amount exceeds Stripe's capturable amount");
    }
    const key = logicalKey(order.id, "capture", String(captureAmount));
    return this.runIntentOperation({
      order,
      operationType: "capture",
      idempotencyKey: key,
      payment,
      request: { amountCents: captureAmount },
      mutate: () =>
        this.stripe.capturePaymentIntent(
          payment.stripe_payment_intent_id,
          captureAmount,
          key,
        ),
    });
  }

  async cancel(orderId: string): Promise<CommerceMutationResult> {
    const order = await this.requireOrder(orderId);
    const payment = await this.requirePayment(order.id);
    if (payment.captured_amount_cents > 0) {
      throw new Error("Captured funds must be refunded, not cancelled");
    }
    const key = logicalKey(order.id, "cancel", payment.stripe_payment_intent_id);
    return this.runIntentOperation({
      order,
      operationType: "cancel",
      idempotencyKey: key,
      payment,
      request: { paymentIntentId: payment.stripe_payment_intent_id },
      mutate: () =>
        this.stripe.cancelPaymentIntent(payment.stripe_payment_intent_id, key),
    });
  }

  async refund(
    orderId: string,
    amountCents: number | null = null,
  ): Promise<CommerceMutationResult> {
    const order = await this.requireOrder(orderId);
    const payment = await this.requirePayment(order.id);
    if (amountCents !== null) this.requirePositiveAmount(amountCents);
    const refundable =
      payment.captured_amount_cents - payment.refunded_amount_cents;
    if (refundable <= 0 || (amountCents !== null && amountCents > refundable)) {
      throw new Error("Refund amount exceeds the remaining captured amount");
    }
    const key = logicalKey(
      order.id,
      "refund",
      amountCents === null ? "remaining" : String(amountCents),
    );

    return this.runIntentOperation({
      order,
      operationType: "refund",
      idempotencyKey: key,
      payment,
      request: { amountCents },
      mutate: async () => {
        await this.stripe.refundPaymentIntent(
          payment.stripe_payment_intent_id,
          amountCents,
          key,
        );
        return this.stripe.retrievePaymentIntent(
          payment.stripe_payment_intent_id,
        );
      },
    });
  }

  private async runIntentOperation(input: {
    order: CommerceOrder;
    operationType: PaymentOperationType;
    idempotencyKey: string;
    payment: PaymentRecord | null;
    request: Record<string, unknown>;
    mutate: () => Promise<Stripe.PaymentIntent>;
  }): Promise<CommerceMutationResult> {
    const claim = await this.repository.claimOperation({
      idempotencyKey: input.idempotencyKey,
      orderId: input.order.id,
      paymentId: input.payment?.id ?? null,
      operationType: input.operationType,
      requestHash: stableHash(input.request),
    });

    let intent = asPaymentIntent(claim.operation.response_snapshot);
    const reused = claim.state === "existing";

    if (!intent) {
      try {
        intent = await input.mutate();
        await this.repository.markOperationStripeSucceeded(
          input.idempotencyKey,
          intentSnapshot(intent),
          stripeRequestId(intent),
        );
      } catch (error) {
        await this.repository.failOperation(
          input.idempotencyKey,
          error instanceof Error ? error.message : String(error),
        );
        throw error;
      }
    }

    try {
      const payment = await this.projectIntent(
        input.order,
        intent,
        `operation:${input.operationType}`,
        input.idempotencyKey,
      );
      await this.repository.completeOperation(input.idempotencyKey);
      return {
        order: input.order,
        payment,
        stripePaymentIntent: intent,
        reused,
      };
    } catch (error) {
      // The saved response is intentionally retained so a retry resumes at the
      // database projection instead of issuing a second Stripe mutation.
      await this.repository.failOperation(
        input.idempotencyKey,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  private async projectIntent(
    order: CommerceOrder,
    intent: Stripe.PaymentIntent,
    source: string,
    eventId = `commerce-v2-sync:${intent.id}:${intent.status}:${intent.amount_received}`,
  ): Promise<PaymentRecord> {
    const occurredAt = this.now().toISOString();
    await this.repository.applyPaymentProjection({
      orderId: order.id,
      projection: projectStripePaymentIntent(intent),
      stripeEventId: eventId,
      stripeEventCreatedAt: occurredAt,
      projectionObservedAt: occurredAt,
    });
    await this.repository.recordOrderEvent({
      orderId: order.id,
      eventType: "payment_projection_applied",
      actorType: "system",
      reason: source,
      eventData: {
        stripePaymentIntentId: intent.id,
        stripeStatus: intent.status,
        source,
      },
    });
    return this.requirePayment(order.id);
  }

  private async requireOrder(orderId: string): Promise<CommerceOrder> {
    const order = await this.repository.getOrder(orderId);
    if (!order) throw new Error("Commerce order not found");
    return order;
  }

  private async requirePayment(orderId: string): Promise<PaymentRecord> {
    const payment = await this.repository.getLatestPaymentForOrder(orderId);
    if (!payment) throw new Error("Commerce payment not found");
    return payment;
  }

  private requirePositiveAmount(amountCents: number): void {
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
      throw new Error("Amount must be a positive integer number of cents");
    }
  }
}
