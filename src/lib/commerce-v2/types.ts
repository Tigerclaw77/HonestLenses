export const COMMERCE_V2_SCHEMA = "commerce_v2";

export type PaymentLifecycleStatus =
  | "requires_payment_method"
  | "requires_confirmation"
  | "requires_action"
  | "processing"
  | "authorized"
  | "captured"
  | "cancelled"
  | "failed"
  | "partially_refunded"
  | "refunded"
  | "disputed";

export type CommerceOrder = {
  id: string;
  customer_user_id: string | null;
  customer_email: string | null;
  order_status: "open" | "cancelled" | "completed";
  currency: string;
  total_cents: number;
  legacy_order_id: string | null;
};

export type PaymentRecord = {
  id: string;
  order_id: string;
  stripe_payment_intent_id: string;
  lifecycle_status: PaymentLifecycleStatus;
  currency: string;
  authorized_amount_cents: number;
  capturable_amount_cents: number;
  captured_amount_cents: number;
  refunded_amount_cents: number;
  disputed_amount_cents: number;
  latest_charge_id: string | null;
  last_stripe_event_id: string | null;
  last_stripe_event_created_at: string | null;
  last_projection_observed_at: string | null;
  stripe_snapshot: Record<string, unknown>;
};

export type PaymentProjection = Omit<
  PaymentRecord,
  | "id"
  | "order_id"
  | "last_stripe_event_id"
  | "last_stripe_event_created_at"
  | "last_projection_observed_at"
> & {
  stripe_created_at: string | null;
  authorized_at: string | null;
  captured_at: string | null;
  cancelled_at: string | null;
  failed_at: string | null;
  failure_code: string | null;
  failure_message: string | null;
  cancellation_reason: string | null;
};

export type ClaimedStripeEvent = {
  stripeEventId: string;
  eventType: string;
  stripeObjectId: string | null;
  stripeObjectType: string | null;
  apiVersion: string | null;
  livemode: boolean;
  occurredAt: string;
  payload: Record<string, unknown>;
};

export type PaymentEventClaim = "claimed" | "retry" | "duplicate";

export type PaymentOperationType =
  | "create"
  | "update"
  | "capture"
  | "cancel"
  | "refund";

export type PaymentOperation = {
  idempotency_key: string;
  order_id: string;
  payment_id: string | null;
  operation_type: PaymentOperationType;
  request_hash: string;
  operation_status: "started" | "stripe_succeeded" | "completed" | "failed";
  response_snapshot: Record<string, unknown> | null;
  last_error: string | null;
};

export type ReconciliationFinding = {
  orderId: string | null;
  paymentId: string | null;
  findingType: string;
  severity: "warning" | "error";
  humanReason: string;
  databaseSnapshot: Record<string, unknown> | null;
  stripeSnapshot: Record<string, unknown> | null;
};

export type SystemHealthMetric =
  | "orphaned_orders"
  | "impossible_states"
  | "stripe_database_mismatches"
  | "missing_action_required_reasons"
  | "webhook_failures"
  | "reconciliation_failures";
