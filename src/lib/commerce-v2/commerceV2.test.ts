import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Stripe from "stripe";

import { CommerceService } from "./commerceService";
import { projectStripePaymentIntent } from "./paymentProjection";
import { reconcilePayments } from "./reconciliationService";
import {
  processLegacyStripeWebhook,
  type LegacyStripeWebhookOrder,
} from "../payments/legacyStripeWebhook";
import type {
  CommerceRepository,
  OperationClaim,
} from "./repository";
import type { StripeGateway } from "./stripeGateway";
import type {
  ClaimedStripeEvent,
  CommerceOrder,
  PaymentOperation,
  PaymentProjection,
  PaymentRecord,
  ReconciliationFinding,
  SystemHealthMetric,
} from "./types";
import {
  processStripeWebhook,
  verifyStripeWebhook,
} from "./webhookService";

function intent(
  overrides: Partial<Stripe.PaymentIntent> = {},
): Stripe.PaymentIntent {
  return {
    id: "pi_test",
    object: "payment_intent",
    amount: 10_000,
    amount_capturable: 10_000,
    amount_received: 0,
    canceled_at: null,
    cancellation_reason: null,
    capture_method: "manual",
    client_secret: "secret",
    confirmation_method: "automatic",
    created: 1_700_000_000,
    currency: "usd",
    customer: null,
    description: null,
    excluded_payment_method_types: null,
    last_payment_error: null,
    latest_charge: null,
    livemode: false,
    metadata: { order_id: ORDER.id, commerce_model: "v2" },
    next_action: null,
    payment_method: null,
    payment_method_configuration_details: null,
    payment_method_options: {},
    payment_method_types: ["card"],
    processing: null,
    receipt_email: null,
    setup_future_usage: null,
    shipping: null,
    source: null,
    statement_descriptor: null,
    statement_descriptor_suffix: null,
    status: "requires_capture",
    transfer_data: null,
    transfer_group: null,
    ...overrides,
  } as Stripe.PaymentIntent;
}

const ORDER: CommerceOrder = {
  id: "11111111-1111-4111-8111-111111111111",
  customer_user_id: null,
  customer_email: "customer@example.com",
  order_status: "open",
  currency: "USD",
  total_cents: 10_000,
  legacy_order_id: null,
};

class MemoryRepository implements CommerceRepository {
  order: CommerceOrder = { ...ORDER };
  payments: PaymentRecord[] = [];
  operations = new Map<string, PaymentOperation>();
  eventStates = new Map<string, "processing" | "succeeded" | "failed" | "ignored">();
  orderEvents: string[] = [];
  findings: ReconciliationFinding[] = [];
  verificationStatus = "verified";
  projectionFailuresRemaining = 0;
  reconciliationRunStatus: "running" | "succeeded" | "failed" | null = null;

  async getOrder(orderId: string) {
    return orderId === this.order.id ? this.order : null;
  }

  async resolveOrderReference(reference: string | null) {
    return reference === this.order.id ? this.order.id : null;
  }

  async getLatestPaymentForOrder(orderId: string) {
    return [...this.payments].reverse().find((p) => p.order_id === orderId) ?? null;
  }

  async getPaymentByIntentId(intentId: string) {
    return (
      this.payments.find((p) => p.stripe_payment_intent_id === intentId) ?? null
    );
  }

  async claimPaymentEvent(event: ClaimedStripeEvent) {
    const status = this.eventStates.get(event.stripeEventId);
    if (status === "succeeded" || status === "ignored" || status === "processing") {
      return "duplicate" as const;
    }
    this.eventStates.set(event.stripeEventId, "processing");
    return status === "failed" ? ("retry" as const) : ("claimed" as const);
  }

  async finishPaymentEvent(
    eventId: string,
    status: "succeeded" | "failed" | "ignored",
  ) {
    this.eventStates.set(eventId, status);
  }

  async applyPaymentProjection(input: {
    orderId: string;
    projection: PaymentProjection;
    stripeEventId: string;
    stripeEventCreatedAt: string;
    projectionObservedAt: string;
  }) {
    if (this.projectionFailuresRemaining > 0) {
      this.projectionFailuresRemaining -= 1;
      throw new Error("simulated database failure");
    }
    const current = await this.getPaymentByIntentId(
      input.projection.stripe_payment_intent_id,
    );
    if (
      current?.last_stripe_event_created_at &&
      current.last_projection_observed_at &&
      current.last_projection_observed_at > input.projectionObservedAt
    ) {
      return current.id;
    }
    const eventIsLatest =
      !current?.last_stripe_event_created_at ||
      current.last_stripe_event_created_at <= input.stripeEventCreatedAt;
    const projected: PaymentRecord = {
      id: current?.id ?? `payment-${this.payments.length + 1}`,
      order_id: input.orderId,
      stripe_payment_intent_id: input.projection.stripe_payment_intent_id,
      lifecycle_status: input.projection.lifecycle_status,
      currency: input.projection.currency,
      authorized_amount_cents: input.projection.authorized_amount_cents,
      capturable_amount_cents: input.projection.capturable_amount_cents,
      captured_amount_cents: input.projection.captured_amount_cents,
      refunded_amount_cents: input.projection.refunded_amount_cents,
      disputed_amount_cents: input.projection.disputed_amount_cents,
      latest_charge_id: input.projection.latest_charge_id,
      last_stripe_event_id: eventIsLatest
        ? input.stripeEventId
        : current.last_stripe_event_id,
      last_stripe_event_created_at: eventIsLatest
        ? input.stripeEventCreatedAt
        : current.last_stripe_event_created_at,
      last_projection_observed_at: input.projectionObservedAt,
      stripe_snapshot: input.projection.stripe_snapshot,
    };
    this.payments = this.payments.filter((p) => p.id !== projected.id);
    this.payments.push(projected);
    return projected.id;
  }

  async claimOperation(input: {
    idempotencyKey: string;
    orderId: string;
    paymentId: string | null;
    operationType: PaymentOperation["operation_type"];
    requestHash: string;
  }): Promise<OperationClaim> {
    const existing = this.operations.get(input.idempotencyKey);
    if (existing) return { state: "existing", operation: existing };
    const operation: PaymentOperation = {
      idempotency_key: input.idempotencyKey,
      order_id: input.orderId,
      payment_id: input.paymentId,
      operation_type: input.operationType,
      request_hash: input.requestHash,
      operation_status: "started",
      response_snapshot: null,
      last_error: null,
    };
    this.operations.set(input.idempotencyKey, operation);
    return { state: "new", operation };
  }

  async markOperationStripeSucceeded(
    key: string,
    response: Record<string, unknown>,
  ) {
    const operation = this.operations.get(key);
    assert(operation);
    operation.operation_status = "stripe_succeeded";
    operation.response_snapshot = response;
  }

  async completeOperation(key: string) {
    const operation = this.operations.get(key);
    assert(operation);
    operation.operation_status = "completed";
  }

  async failOperation(key: string, error: string) {
    const operation = this.operations.get(key);
    assert(operation);
    operation.last_error = error;
    if (!operation.response_snapshot) operation.operation_status = "failed";
  }

  async recordOrderEvent(input: { eventType: string }) {
    this.orderEvents.push(input.eventType);
  }

  async startReconciliationRun() {
    this.reconciliationRunStatus = "running";
    return "run-1";
  }

  async listPaymentsForReconciliation(limit: number) {
    return this.payments.slice(0, limit);
  }

  async addReconciliationFinding(
    _runId: string,
    finding: ReconciliationFinding,
  ) {
    this.findings.push(finding);
  }

  async finishReconciliationRun(input: {
    status: "succeeded" | "failed";
  }) {
    this.reconciliationRunStatus = input.status;
  }

  async getSystemHealth() {
    return {
      orphaned_orders: 0,
      impossible_states: 0,
      stripe_database_mismatches: 0,
      missing_action_required_reasons: 0,
      webhook_failures: 0,
      reconciliation_failures: 0,
    } satisfies Record<SystemHealthMetric, number>;
  }

  async applyAdminOverride(input: {
    orderId: string;
    orderStatus: "open" | "cancelled" | "completed";
    actorId: string;
    reason: string;
  }) {
    this.order = { ...this.order, order_status: input.orderStatus };
    this.orderEvents.push("admin_override");
    return "adjustment-1";
  }
}

class MemoryStripe implements StripeGateway {
  calls: { operation: string; key?: string }[] = [];
  current = intent();
  failNext: Error | null = null;

  private result(operation: string, key?: string) {
    this.calls.push({ operation, key });
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = null;
      throw error;
    }
    return Promise.resolve(this.current);
  }

  createPaymentIntent(_input: unknown, key: string) {
    return this.result("create", key);
  }
  retrievePaymentIntent() {
    return this.result("retrieve");
  }
  async retrievePaymentIntentIdForCharge() {
    this.calls.push({ operation: "retrieve-charge" });
    return this.current.id;
  }
  updatePaymentIntentAmount(
    _id: string,
    amount: number,
    _orderId: string,
    key: string,
  ) {
    this.current = intent({ amount, amount_capturable: amount });
    return this.result("update", key);
  }
  capturePaymentIntent(_id: string, amount: number, key: string) {
    this.current = intent({
      amount_capturable: 0,
      amount_received: amount,
      status: "succeeded",
      latest_charge: {
        id: "ch_test",
        object: "charge",
        amount,
        amount_refunded: 0,
        created: 1_700_000_100,
        disputed: false,
      } as Stripe.Charge,
    });
    return this.result("capture", key);
  }
  cancelPaymentIntent(_id: string, key: string) {
    this.current = intent({ status: "canceled", canceled_at: 1_700_000_100 });
    return this.result("cancel", key);
  }
  async refundPaymentIntent(_id: string, amount: number | null, key: string) {
    this.calls.push({ operation: "refund", key });
    const captured = this.current.amount_received;
    this.current = intent({
      status: "succeeded",
      amount_capturable: 0,
      amount_received: captured,
      latest_charge: {
        id: "ch_test",
        object: "charge",
        amount: captured,
        amount_refunded: amount ?? captured,
        created: 1_700_000_100,
        disputed: false,
      } as Stripe.Charge,
    });
    return { id: "re_test", object: "refund" } as Stripe.Refund;
  }
}

function stripeEvent(
  id: string,
  createdOrType: number | Stripe.Event.Type,
  object: Stripe.Event.Data.Object = intent(),
): Stripe.Event {
  return {
    id,
    object: "event",
    api_version: "2025-12-15.clover",
    created: typeof createdOrType === "number" ? createdOrType : 1_700_000_000,
    data: { object },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type:
      typeof createdOrType === "number"
        ? "payment_intent.amount_capturable_updated"
        : createdOrType,
  } as Stripe.Event;
}

async function main() {
  const authorized = projectStripePaymentIntent(intent());
  assert.equal(authorized.lifecycle_status, "authorized");
  assert.equal(
    projectStripePaymentIntent(
      intent({
        status: "requires_payment_method",
        last_payment_error: {
          type: "card_error",
          code: "card_declined",
          message: "Declined",
        } as Stripe.PaymentIntent.LastPaymentError,
      }),
    ).lifecycle_status,
    "failed",
  );

  const repository = new MemoryRepository();
  const stripe = new MemoryStripe();
  const service = new CommerceService({
    repository,
    stripe,
    now: () => new Date("2026-07-29T12:00:00.000Z"),
  });

  repository.projectionFailuresRemaining = 1;
  await assert.rejects(
    service.createOrReusePayment(ORDER.id),
    /simulated database failure/,
  );
  assert.equal(
    stripe.calls.filter((call) => call.operation === "create").length,
    1,
    "Stripe succeeds / DB fails must checkpoint the Stripe response",
  );
  const retried = await service.createOrReusePayment(ORDER.id);
  assert.equal(retried.payment.lifecycle_status, "authorized");
  assert.equal(
    stripe.calls.filter((call) => call.operation === "create").length,
    1,
    "retry must project the checkpoint instead of creating again",
  );

  const concurrentRepository = new MemoryRepository();
  const concurrentStripe = new MemoryStripe();
  const concurrentService = new CommerceService({
    repository: concurrentRepository,
    stripe: concurrentStripe,
    now: () => new Date("2026-07-29T12:00:00.000Z"),
  });
  await Promise.all([
    concurrentService.createOrReusePayment(ORDER.id),
    concurrentService.createOrReusePayment(ORDER.id),
  ]);
  assert.equal(
    new Set(
      concurrentStripe.calls
        .filter((call) => call.operation === "create")
        .map((call) => call.key),
    ).size,
    1,
    "concurrent checkout uses one stable logical idempotency key",
  );

  const paymentBeforeOutage = await repository.getLatestPaymentForOrder(ORDER.id);
  assert(paymentBeforeOutage);
  stripe.failNext = new Error("temporary Stripe outage");
  await assert.rejects(service.cancel(ORDER.id), /temporary Stripe outage/);
  assert.equal(
    (await repository.getLatestPaymentForOrder(ORDER.id))
      ?.stripe_payment_intent_id,
    paymentBeforeOutage.stripe_payment_intent_id,
    "temporary failures never detach PaymentIntent references",
  );

  const captureRepository = new MemoryRepository();
  const captureStripe = new MemoryStripe();
  const captureService = new CommerceService({
    repository: captureRepository,
    stripe: captureStripe,
    now: () => new Date("2026-07-29T12:00:00.000Z"),
  });
  await captureService.createOrReusePayment(ORDER.id);
  const captured = await captureService.capture(ORDER.id);
  assert.equal(captured.payment.lifecycle_status, "captured");
  await captureRepository.applyAdminOverride({
    orderId: ORDER.id,
    orderStatus: "completed",
    actorId: "admin",
    reason: "Support resolution",
  });
  assert.equal(
    (await captureRepository.getLatestPaymentForOrder(ORDER.id))
      ?.captured_amount_cents,
    10_000,
    "admin adjustments do not rewrite historical payment truth",
  );
  assert(captureRepository.orderEvents.includes("admin_override"));

  const refunded = await captureService.refund(ORDER.id, 2_500);
  assert.equal(refunded.payment.lifecycle_status, "partially_refunded");

  const cancelRepository = new MemoryRepository();
  const cancelStripe = new MemoryStripe();
  const cancelService = new CommerceService({
    repository: cancelRepository,
    stripe: cancelStripe,
    now: () => new Date("2026-07-29T12:00:00.000Z"),
  });
  await cancelService.createOrReusePayment(ORDER.id);
  assert.equal(
    (await cancelService.cancel(ORDER.id)).payment.lifecycle_status,
    "cancelled",
  );

  const webhookRepository = new MemoryRepository();
  const webhookStripe = new MemoryStripe();
  const newerEvent = stripeEvent("evt_new", 200);
  webhookStripe.current = intent({
    status: "succeeded",
    amount_received: 10_000,
    latest_charge: {
      id: "ch_test",
      object: "charge",
      amount: 10_000,
      amount_refunded: 0,
      created: 1_700_000_100,
      disputed: false,
    } as Stripe.Charge,
  });
  await processStripeWebhook(newerEvent, {
    repository: webhookRepository,
    stripe: webhookStripe,
  });
  const olderEvent = stripeEvent("evt_old", 100);
  await processStripeWebhook(olderEvent, {
    repository: webhookRepository,
    stripe: webhookStripe,
  });
  assert.equal(
    (await webhookRepository.getLatestPaymentForOrder(ORDER.id))
      ?.lifecycle_status,
    "captured",
    "out-of-order webhook cannot rewind payment state",
  );
  assert.equal(
    (await webhookRepository.getLatestPaymentForOrder(ORDER.id))
      ?.last_stripe_event_id,
    "evt_new",
    "out-of-order processing does not regress the latest event pointer",
  );
  const duplicate = await processStripeWebhook(newerEvent, {
    repository: webhookRepository,
    stripe: webhookStripe,
  });
  assert.equal(duplicate.duplicate, true);

  webhookStripe.current = intent({
    status: "succeeded",
    amount_received: 10_000,
    latest_charge: {
      id: "ch_test",
      object: "charge",
      amount: 10_000,
      amount_refunded: 0,
      created: 1_700_000_100,
      disputed: true,
    } as Stripe.Charge,
  });
  const disputeEvent = {
    ...stripeEvent("evt_dispute", 300),
    type: "charge.dispute.created",
    data: {
      object: {
        id: "dp_test",
        object: "dispute",
        charge: "ch_test",
      },
    },
  } as Stripe.Event;
  await processStripeWebhook(disputeEvent, {
    repository: webhookRepository,
    stripe: webhookStripe,
  });
  assert.equal(
    (await webhookRepository.getLatestPaymentForOrder(ORDER.id))
      ?.lifecycle_status,
    "disputed",
  );
  assert(
    webhookStripe.calls.some((call) => call.operation === "retrieve-charge"),
  );

  const signingSecret = "whsec_test";
  const payload = JSON.stringify(stripeEvent("evt_signed", 300));
  const validHeader = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: signingSecret,
  });
  assert.equal(
    verifyStripeWebhook(payload, validHeader, signingSecret, "sk_test_local").id,
    "evt_signed",
  );
  assert.throws(
    () =>
      verifyStripeWebhook(
        payload,
        "t=1,v1=invalid",
        signingSecret,
        "sk_test_local",
      ),
    /signature/i,
  );

  const webhookRoute = readFileSync(
    join(
      process.cwd(),
      "src",
      "app",
      "api",
      "webhooks",
      "stripe",
      "route.ts",
    ),
    "utf8",
  );
  const signatureVerificationIndex = webhookRoute.indexOf(
    "event = verifyStripeWebhook",
  );
  const disabledAcknowledgementIndex = webhookRoute.indexOf(
    "if (!isCommerceV2Enabled())",
  );
  assert(
    signatureVerificationIndex >= 0 &&
      disabledAcknowledgementIndex > signatureVerificationIndex,
    "Commerce v2 gating occurs only after Stripe signature verification",
  );
  assert.match(webhookRoute, /received:\s*true/);
  assert.match(webhookRoute, /processLegacyStripeWebhook/);
  assert.doesNotMatch(
    webhookRoute,
    /Commerce v2 is not enabled/,
    "disabled Commerce v2 acknowledges signed events instead of returning 503",
  );

  const legacyOrder: LegacyStripeWebhookOrder = {
    id: ORDER.id,
    status: "authorized",
    payment_intent_id: "pi_legacy",
    total_amount_cents: 10_000,
    capture_amount_cents: null,
    feedback_credit_cents: null,
  };
  let legacyCaptureMutations = 0;
  const legacyRepository = {
    async findOrder(orderId: string, paymentIntentId: string) {
      return orderId === legacyOrder.id &&
        paymentIntentId === legacyOrder.payment_intent_id
        ? legacyOrder
        : null;
    },
    async markCaptured(orderId: string, paymentIntentId: string) {
      if (
        orderId !== legacyOrder.id ||
        paymentIntentId !== legacyOrder.payment_intent_id ||
        legacyOrder.status !== "authorized"
      ) {
        return false;
      }
      legacyOrder.status = "captured";
      legacyCaptureMutations += 1;
      return true;
    },
  };
  const legacySucceededEvent = stripeEvent(
    "evt_legacy_succeeded",
    "payment_intent.succeeded",
    intent({
      id: "pi_legacy",
      status: "succeeded",
      amount_capturable: 0,
      amount_received: 10_000,
      metadata: { order_id: ORDER.id },
    }),
  );
  assert.deepEqual(
    await processLegacyStripeWebhook(legacySucceededEvent, legacyRepository),
    {
      processed: true,
      ignored: false,
      reason: "captured",
      orderId: ORDER.id,
    },
    "legacy mode reconciles an exact-amount succeeded PaymentIntent",
  );
  assert.deepEqual(
    await processLegacyStripeWebhook(legacySucceededEvent, legacyRepository),
    {
      processed: false,
      ignored: false,
      reason: "already_current",
      orderId: ORDER.id,
    },
    "replaying a legacy succeeded event is idempotent",
  );
  assert.equal(legacyCaptureMutations, 1);

  for (const eventType of [
    "payment_intent.created",
    "payment_intent.amount_capturable_updated",
    "payment_intent.canceled",
  ] as const) {
    const ignored = await processLegacyStripeWebhook(
      stripeEvent(`evt_legacy_${eventType}`, eventType, intent()),
      legacyRepository,
    );
    assert.equal(ignored.reason, "event_not_used_by_legacy");
    assert.equal(ignored.ignored, true);
  }
  assert.equal(
    legacyCaptureMutations,
    1,
    "acknowledged legacy events do not mutate order state",
  );

  const reconcileRepository = new MemoryRepository();
  reconcileRepository.payments = [
    {
      ...(await webhookRepository.getLatestPaymentForOrder(ORDER.id))!,
      lifecycle_status: "authorized",
      captured_amount_cents: 0,
    },
  ];
  const verificationBefore = reconcileRepository.verificationStatus;
  webhookStripe.current = intent({
    status: "succeeded",
    amount_received: 10_000,
    latest_charge: {
      id: "ch_test",
      object: "charge",
      amount: 10_000,
      amount_refunded: 0,
      created: 1_700_000_100,
      disputed: false,
    } as Stripe.Charge,
  });
  const reconciliation = await reconcilePayments(
    {
      repository: reconcileRepository,
      stripe: webhookStripe,
      now: () => new Date("2099-07-29T13:00:00.000Z"),
    },
    { source: "test" },
  );
  assert.equal(reconciliation.mismatchCount, 1);
  assert.equal(
    reconcileRepository.verificationStatus,
    verificationBefore,
    "payment reconciliation must never alter prescription verification",
  );
  assert.equal(
    (await reconcileRepository.getLatestPaymentForOrder(ORDER.id))
      ?.lifecycle_status,
    "captured",
  );

  console.log("commerce v2 lifecycle tests passed");
}

void main();
