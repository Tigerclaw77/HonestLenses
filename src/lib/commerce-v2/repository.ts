import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase-server";
import type {
  ClaimedStripeEvent,
  CommerceOrder,
  PaymentEventClaim,
  PaymentOperation,
  PaymentOperationType,
  PaymentProjection,
  PaymentRecord,
  ReconciliationFinding,
  SystemHealthMetric,
} from "./types";
import { COMMERCE_V2_SCHEMA } from "./types";

export type OperationClaim =
  | { state: "new"; operation: PaymentOperation }
  | { state: "existing"; operation: PaymentOperation };

export interface CommerceRepository {
  getOrder(orderId: string): Promise<CommerceOrder | null>;
  resolveOrderReference(reference: string | null): Promise<string | null>;
  getLatestPaymentForOrder(orderId: string): Promise<PaymentRecord | null>;
  getPaymentByIntentId(intentId: string): Promise<PaymentRecord | null>;
  claimPaymentEvent(event: ClaimedStripeEvent): Promise<PaymentEventClaim>;
  finishPaymentEvent(
    eventId: string,
    status: "succeeded" | "failed" | "ignored",
    error?: string | null,
  ): Promise<void>;
  applyPaymentProjection(input: {
    orderId: string;
    projection: PaymentProjection;
    stripeEventId: string;
    stripeEventCreatedAt: string;
    projectionObservedAt: string;
  }): Promise<string>;
  claimOperation(input: {
    idempotencyKey: string;
    orderId: string;
    paymentId: string | null;
    operationType: PaymentOperationType;
    requestHash: string;
  }): Promise<OperationClaim>;
  markOperationStripeSucceeded(
    idempotencyKey: string,
    response: Record<string, unknown>,
    stripeRequestId?: string | null,
  ): Promise<void>;
  completeOperation(idempotencyKey: string): Promise<void>;
  failOperation(idempotencyKey: string, error: string): Promise<void>;
  recordOrderEvent(input: {
    orderId: string;
    eventType: string;
    actorType: "customer" | "admin" | "system" | "webhook" | "reconciliation";
    actorId?: string | null;
    reason?: string | null;
    eventData?: Record<string, unknown>;
  }): Promise<void>;
  startReconciliationRun(source: string): Promise<string>;
  listPaymentsForReconciliation(limit: number): Promise<PaymentRecord[]>;
  addReconciliationFinding(
    runId: string,
    finding: ReconciliationFinding,
  ): Promise<void>;
  finishReconciliationRun(input: {
    runId: string;
    status: "succeeded" | "failed";
    scannedCount: number;
    mismatchCount: number;
    errorCount: number;
    errorSummary?: string | null;
  }): Promise<void>;
  getSystemHealth(): Promise<Record<SystemHealthMetric, number>>;
  applyAdminOverride(input: {
    orderId: string;
    orderStatus: "open" | "cancelled" | "completed";
    actorId: string;
    reason: string;
  }): Promise<string>;
}

function throwOnError(
  error: { message: string } | null,
  context: string,
): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export class SupabaseCommerceRepository implements CommerceRepository {
  private readonly db;

  constructor(client: SupabaseClient = supabaseServer) {
    this.db = client.schema(COMMERCE_V2_SCHEMA);
  }

  async getOrder(orderId: string): Promise<CommerceOrder | null> {
    const { data, error } = await this.db
      .from("orders")
      .select(
        "id, customer_user_id, customer_email, order_status, currency, total_cents, legacy_order_id",
      )
      .eq("id", orderId)
      .maybeSingle();
    throwOnError(error, "Load v2 order");
    return (data as CommerceOrder | null) ?? null;
  }

  async resolveOrderReference(reference: string | null): Promise<string | null> {
    if (!reference || !isUuid(reference)) return null;

    const { data, error } = await this.db
      .from("orders")
      .select("id")
      .or(`id.eq.${reference},legacy_order_id.eq.${reference}`)
      .limit(1)
      .maybeSingle();
    throwOnError(error, "Resolve order reference");
    return typeof data?.id === "string" ? data.id : null;
  }

  async getLatestPaymentForOrder(
    orderId: string,
  ): Promise<PaymentRecord | null> {
    const { data, error } = await this.db
      .from("payments")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    throwOnError(error, "Load latest v2 payment");
    return (data as PaymentRecord | null) ?? null;
  }

  async getPaymentByIntentId(
    intentId: string,
  ): Promise<PaymentRecord | null> {
    const { data, error } = await this.db
      .from("payments")
      .select("*")
      .eq("stripe_payment_intent_id", intentId)
      .maybeSingle();
    throwOnError(error, "Load v2 payment by PaymentIntent");
    return (data as PaymentRecord | null) ?? null;
  }

  async claimPaymentEvent(
    event: ClaimedStripeEvent,
  ): Promise<PaymentEventClaim> {
    const { data, error } = await this.db.rpc("claim_payment_event", {
      p_stripe_event_id: event.stripeEventId,
      p_event_type: event.eventType,
      p_stripe_object_id: event.stripeObjectId,
      p_stripe_object_type: event.stripeObjectType,
      p_api_version: event.apiVersion,
      p_livemode: event.livemode,
      p_occurred_at: event.occurredAt,
      p_payload: event.payload,
    });
    throwOnError(error, "Claim Stripe event");
    if (data !== "claimed" && data !== "retry" && data !== "duplicate") {
      throw new Error(`Unexpected Stripe event claim result: ${String(data)}`);
    }
    return data;
  }

  async finishPaymentEvent(
    eventId: string,
    status: "succeeded" | "failed" | "ignored",
    error?: string | null,
  ): Promise<void> {
    const result = await this.db.rpc("finish_payment_event", {
      p_stripe_event_id: eventId,
      p_status: status,
      p_error: error ?? null,
    });
    throwOnError(result.error, "Finish Stripe event");
  }

  async applyPaymentProjection(input: {
    orderId: string;
    projection: PaymentProjection;
    stripeEventId: string;
    stripeEventCreatedAt: string;
    projectionObservedAt: string;
  }): Promise<string> {
    const p = input.projection;
    const { data, error } = await this.db.rpc("apply_payment_projection", {
      p_order_id: input.orderId,
      p_stripe_payment_intent_id: p.stripe_payment_intent_id,
      p_lifecycle_status: p.lifecycle_status,
      p_currency: p.currency,
      p_authorized_amount_cents: p.authorized_amount_cents,
      p_capturable_amount_cents: p.capturable_amount_cents,
      p_captured_amount_cents: p.captured_amount_cents,
      p_refunded_amount_cents: p.refunded_amount_cents,
      p_disputed_amount_cents: p.disputed_amount_cents,
      p_latest_charge_id: p.latest_charge_id,
      p_failure_code: p.failure_code,
      p_failure_message: p.failure_message,
      p_cancellation_reason: p.cancellation_reason,
      p_stripe_created_at: p.stripe_created_at,
      p_authorized_at: p.authorized_at,
      p_captured_at: p.captured_at,
      p_cancelled_at: p.cancelled_at,
      p_failed_at: p.failed_at,
      p_stripe_event_id: input.stripeEventId,
      p_stripe_event_created_at: input.stripeEventCreatedAt,
      p_projection_observed_at: input.projectionObservedAt,
      p_stripe_snapshot: p.stripe_snapshot,
    });
    throwOnError(error, "Apply Stripe payment projection");
    if (typeof data !== "string") {
      throw new Error("Payment projection did not return a payment id");
    }
    return data;
  }

  async claimOperation(input: {
    idempotencyKey: string;
    orderId: string;
    paymentId: string | null;
    operationType: PaymentOperationType;
    requestHash: string;
  }): Promise<OperationClaim> {
    const operation = {
      idempotency_key: input.idempotencyKey,
      order_id: input.orderId,
      payment_id: input.paymentId,
      operation_type: input.operationType,
      request_hash: input.requestHash,
      operation_status: "started",
    };
    const inserted = await this.db
      .from("payment_operations")
      .insert(operation)
      .select("*")
      .maybeSingle();

    if (!inserted.error && inserted.data) {
      return {
        state: "new",
        operation: inserted.data as PaymentOperation,
      };
    }

    if (inserted.error?.code !== "23505") {
      throwOnError(inserted.error, "Claim payment operation");
    }

    const existing = await this.db
      .from("payment_operations")
      .select("*")
      .eq("idempotency_key", input.idempotencyKey)
      .single();
    throwOnError(existing.error, "Load existing payment operation");

    const existingOperation = existing.data as PaymentOperation;
    if (
      existingOperation.operation_type !== input.operationType ||
      existingOperation.order_id !== input.orderId ||
      existingOperation.request_hash !== input.requestHash
    ) {
      throw new Error(
        "Idempotency key was reused with different payment operation parameters",
      );
    }

    return { state: "existing", operation: existingOperation };
  }

  async markOperationStripeSucceeded(
    idempotencyKey: string,
    response: Record<string, unknown>,
    stripeRequestId?: string | null,
  ): Promise<void> {
    const { error } = await this.db
      .from("payment_operations")
      .update({
        operation_status: "stripe_succeeded",
        response_snapshot: response,
        stripe_request_id: stripeRequestId ?? null,
        last_error: null,
      })
      .eq("idempotency_key", idempotencyKey);
    throwOnError(error, "Record Stripe operation success");
  }

  async completeOperation(idempotencyKey: string): Promise<void> {
    const { error } = await this.db
      .from("payment_operations")
      .update({
        operation_status: "completed",
        completed_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("idempotency_key", idempotencyKey);
    throwOnError(error, "Complete payment operation");
  }

  async failOperation(idempotencyKey: string, errorMessage: string): Promise<void> {
    // The RPC preserves the stripe_succeeded checkpoint atomically when the
    // external mutation succeeded but its local projection failed.
    const { error } = await this.db.rpc("fail_payment_operation", {
      p_idempotency_key: idempotencyKey,
      p_error: errorMessage,
    });
    throwOnError(error, "Fail payment operation");
  }

  async recordOrderEvent(input: {
    orderId: string;
    eventType: string;
    actorType: "customer" | "admin" | "system" | "webhook" | "reconciliation";
    actorId?: string | null;
    reason?: string | null;
    eventData?: Record<string, unknown>;
  }): Promise<void> {
    const { error } = await this.db.from("order_events").insert({
      order_id: input.orderId,
      event_type: input.eventType,
      actor_type: input.actorType,
      actor_id: input.actorId ?? null,
      reason: input.reason ?? null,
      event_data: input.eventData ?? {},
    });
    throwOnError(error, "Record v2 order event");
  }

  async startReconciliationRun(source: string): Promise<string> {
    const { data, error } = await this.db
      .from("reconciliation_runs")
      .insert({ run_status: "running", source })
      .select("id")
      .single();
    throwOnError(error, "Start reconciliation run");
    if (!data || typeof data.id !== "string") {
      throw new Error("Reconciliation run did not return an id");
    }
    return data.id;
  }

  async listPaymentsForReconciliation(limit: number): Promise<PaymentRecord[]> {
    const { data, error } = await this.db
      .from("payments")
      .select("*")
      .order("updated_at", { ascending: true })
      .limit(limit);
    throwOnError(error, "List payments for reconciliation");
    return (data ?? []) as PaymentRecord[];
  }

  async addReconciliationFinding(
    runId: string,
    finding: ReconciliationFinding,
  ): Promise<void> {
    const { error } = await this.db.from("reconciliation_findings").insert({
      run_id: runId,
      order_id: finding.orderId,
      payment_id: finding.paymentId,
      finding_type: finding.findingType,
      severity: finding.severity,
      human_reason: finding.humanReason,
      database_snapshot: finding.databaseSnapshot,
      stripe_snapshot: finding.stripeSnapshot,
    });
    throwOnError(error, "Record reconciliation finding");
  }

  async finishReconciliationRun(input: {
    runId: string;
    status: "succeeded" | "failed";
    scannedCount: number;
    mismatchCount: number;
    errorCount: number;
    errorSummary?: string | null;
  }): Promise<void> {
    const { error } = await this.db
      .from("reconciliation_runs")
      .update({
        run_status: input.status,
        scanned_count: input.scannedCount,
        mismatch_count: input.mismatchCount,
        error_count: input.errorCount,
        completed_at: new Date().toISOString(),
        error_summary: input.errorSummary ?? null,
      })
      .eq("id", input.runId);
    throwOnError(error, "Finish reconciliation run");
  }

  async getSystemHealth(): Promise<Record<SystemHealthMetric, number>> {
    const { data, error } = await this.db
      .from("system_health_summary")
      .select("metric, count");
    throwOnError(error, "Load v2 system health");

    const result = {
      orphaned_orders: 0,
      impossible_states: 0,
      stripe_database_mismatches: 0,
      missing_action_required_reasons: 0,
      webhook_failures: 0,
      reconciliation_failures: 0,
    } satisfies Record<SystemHealthMetric, number>;

    for (const row of data ?? []) {
      const metric = row.metric as SystemHealthMetric;
      if (metric in result) result[metric] = Number(row.count ?? 0);
    }
    return result;
  }

  async applyAdminOverride(input: {
    orderId: string;
    orderStatus: "open" | "cancelled" | "completed";
    actorId: string;
    reason: string;
  }): Promise<string> {
    const { data, error } = await this.db.rpc("apply_admin_override", {
      p_order_id: input.orderId,
      p_order_status: input.orderStatus,
      p_actor_id: input.actorId,
      p_reason: input.reason,
    });
    throwOnError(error, "Apply admin override");
    if (typeof data !== "string") {
      throw new Error("Admin override did not return an adjustment id");
    }
    return data;
  }
}
