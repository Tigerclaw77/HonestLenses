-- Honest Lenses commerce v2, Phase 1.
--
-- This migration is intentionally additive. It does not copy legacy data,
-- redirect production traffic, rename public.orders, or alter Stripe state.

create schema if not exists commerce_v2;
create schema if not exists legacy_archive;

comment on schema commerce_v2 is
  'Canonical Honest Lenses commerce model. Phase 1 is service-role only and has no production cutover.';
comment on schema legacy_archive is
  'Reserved for immutable legacy snapshots created during the reviewed cutover phase.';

revoke all on schema commerce_v2 from public, anon, authenticated;
grant usage on schema commerce_v2 to service_role;
revoke all on schema legacy_archive from public, anon, authenticated;
grant usage on schema legacy_archive to service_role;

create or replace function commerce_v2.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function commerce_v2.reject_append_only_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_schema || '.' || tg_table_name
    using errcode = '55000';
end;
$$;

create or replace function legacy_archive.reject_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception '% is a read-only legacy archive', tg_table_schema || '.' || tg_table_name
    using errcode = '55000';
end;
$$;

create table commerce_v2.orders (
  id uuid primary key default gen_random_uuid(),
  customer_user_id uuid,
  customer_email text,
  order_status text not null default 'open'
    check (order_status in ('open', 'cancelled', 'completed')),
  currency text not null default 'USD'
    check (currency = upper(currency) and length(currency) = 3),
  subtotal_cents bigint not null check (subtotal_cents >= 0),
  shipping_cents bigint not null default 0 check (shipping_cents >= 0),
  tax_cents bigint not null default 0 check (tax_cents >= 0),
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  total_cents bigint not null check (total_cents >= 0),
  pricing_snapshot jsonb not null default '{}'::jsonb,
  customer_snapshot jsonb not null default '{}'::jsonb,
  shipping_snapshot jsonb not null default '{}'::jsonb,
  placed_at timestamptz not null,
  cancelled_at timestamptz,
  completed_at timestamptz,
  legacy_order_id uuid unique,
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_total_matches_components check (
    total_cents = subtotal_cents + shipping_cents + tax_cents - discount_cents
  ),
  constraint orders_terminal_timestamp_check check (
    (order_status <> 'cancelled' or cancelled_at is not null)
    and (order_status <> 'completed' or completed_at is not null)
  )
);

comment on column commerce_v2.orders.customer_user_id is
  'Supabase Auth identity at order time. Deliberately has no FK so account deletion cannot delete or invalidate accounting history.';
comment on column commerce_v2.orders.legacy_order_id is
  'Stable pointer to public.orders during staged migration; never used as v2 payment truth.';

create index orders_customer_created_idx
  on commerce_v2.orders (customer_user_id, placed_at desc)
  where customer_user_id is not null;
create index orders_open_placed_idx
  on commerce_v2.orders (placed_at)
  where order_status = 'open';

create table commerce_v2.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references commerce_v2.orders(id) on delete restrict,
  ordinal integer not null check (ordinal > 0),
  eye text check (eye is null or eye in ('right', 'left')),
  sku text not null,
  manufacturer text,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_amount_cents bigint not null check (unit_amount_cents >= 0),
  line_amount_cents bigint generated always as
    (quantity::bigint * unit_amount_cents) stored,
  product_snapshot jsonb not null,
  prescription_snapshot jsonb,
  created_at timestamptz not null default now(),
  unique (order_id, ordinal)
);

create index order_items_order_id_idx on commerce_v2.order_items (order_id);

create table commerce_v2.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references commerce_v2.orders(id) on delete restrict,
  stripe_payment_intent_id text not null unique,
  lifecycle_status text not null check (
    lifecycle_status in (
      'requires_payment_method',
      'requires_confirmation',
      'requires_action',
      'processing',
      'authorized',
      'captured',
      'cancelled',
      'failed',
      'partially_refunded',
      'refunded',
      'disputed'
    )
  ),
  currency text not null check (currency = upper(currency) and length(currency) = 3),
  authorized_amount_cents bigint not null default 0 check (authorized_amount_cents >= 0),
  capturable_amount_cents bigint not null default 0 check (capturable_amount_cents >= 0),
  captured_amount_cents bigint not null default 0 check (captured_amount_cents >= 0),
  refunded_amount_cents bigint not null default 0 check (refunded_amount_cents >= 0),
  disputed_amount_cents bigint not null default 0 check (disputed_amount_cents >= 0),
  latest_charge_id text,
  failure_code text,
  failure_message text,
  cancellation_reason text,
  stripe_created_at timestamptz,
  authorized_at timestamptz,
  captured_at timestamptz,
  cancelled_at timestamptz,
  failed_at timestamptz,
  last_stripe_event_id text,
  last_stripe_event_created_at timestamptz,
  last_projection_observed_at timestamptz,
  stripe_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_captured_not_above_authorized check (
    captured_amount_cents <= authorized_amount_cents
  ),
  constraint payments_refunded_not_above_captured check (
    refunded_amount_cents <= captured_amount_cents
  ),
  constraint payments_disputed_not_above_captured check (
    disputed_amount_cents <= captured_amount_cents
  )
);

create index payments_order_created_idx
  on commerce_v2.payments (order_id, created_at desc);
create unique index payments_latest_charge_unique_idx
  on commerce_v2.payments (latest_charge_id)
  where latest_charge_id is not null;
create index payments_reconciliation_idx
  on commerce_v2.payments (updated_at, stripe_payment_intent_id)
  where lifecycle_status not in ('cancelled', 'refunded');

create table commerce_v2.payment_events (
  stripe_event_id text primary key,
  event_type text not null,
  stripe_object_id text,
  stripe_object_type text,
  payment_id uuid references commerce_v2.payments(id) on delete set null,
  order_id uuid references commerce_v2.orders(id) on delete set null,
  api_version text,
  livemode boolean not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  signature_verified boolean not null,
  payload jsonb not null
);

create index payment_events_payment_occurred_idx
  on commerce_v2.payment_events (payment_id, occurred_at desc);
create index payment_events_order_occurred_idx
  on commerce_v2.payment_events (order_id, occurred_at desc);
create index payment_events_type_occurred_idx
  on commerce_v2.payment_events (event_type, occurred_at desc);

create table commerce_v2.payment_event_inbox (
  stripe_event_id text primary key
    references commerce_v2.payment_events(stripe_event_id) on delete restrict,
  processing_status text not null
    check (processing_status in ('processing', 'succeeded', 'failed', 'ignored')),
  attempt_count integer not null default 1 check (attempt_count > 0),
  claimed_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

create index payment_event_inbox_failures_idx
  on commerce_v2.payment_event_inbox (updated_at)
  where processing_status = 'failed';

create table commerce_v2.payment_operations (
  idempotency_key text primary key,
  order_id uuid not null references commerce_v2.orders(id) on delete restrict,
  payment_id uuid references commerce_v2.payments(id) on delete set null,
  operation_type text not null
    check (operation_type in ('create', 'update', 'capture', 'cancel', 'refund')),
  request_hash text not null,
  operation_status text not null
    check (operation_status in ('started', 'stripe_succeeded', 'completed', 'failed')),
  stripe_request_id text,
  response_snapshot jsonb,
  attempt_count integer not null default 1 check (attempt_count > 0),
  last_error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index payment_operations_order_started_idx
  on commerce_v2.payment_operations (order_id, started_at desc);
create index payment_operations_payment_idx
  on commerce_v2.payment_operations (payment_id)
  where payment_id is not null;
create index payment_operations_incomplete_idx
  on commerce_v2.payment_operations (updated_at)
  where operation_status in ('started', 'stripe_succeeded', 'failed');

create table commerce_v2.prescription_verifications (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references commerce_v2.orders(id) on delete restrict,
  attempt_number integer not null check (attempt_number > 0),
  verification_status text not null check (
    verification_status in (
      'information_needed',
      'pending',
      'verified',
      'rejected',
      'blocked'
    )
  ),
  verification_method text check (
    verification_method is null
    or verification_method in ('manual', 'upload', 'ocr', 'doctor', 'passive', 'admin')
  ),
  patient_snapshot jsonb not null,
  prescriber_snapshot jsonb,
  prescription_snapshot jsonb,
  requested_at timestamptz,
  deadline_at timestamptz,
  completed_at timestamptz,
  outcome_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, attempt_number)
);

create index prescription_verifications_order_idx
  on commerce_v2.prescription_verifications (order_id, attempt_number desc);
create index prescription_verifications_pending_idx
  on commerce_v2.prescription_verifications (deadline_at)
  where verification_status = 'pending';

create table commerce_v2.prescription_verification_events (
  id uuid primary key default gen_random_uuid(),
  verification_id uuid not null
    references commerce_v2.prescription_verifications(id) on delete restrict,
  event_type text not null,
  previous_status text,
  new_status text,
  actor_type text not null
    check (actor_type in ('customer', 'admin', 'system', 'webhook', 'reconciliation')),
  actor_id text,
  reason text,
  event_data jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index prescription_verification_events_verification_idx
  on commerce_v2.prescription_verification_events (verification_id, occurred_at);

create table commerce_v2.fulfillments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references commerce_v2.orders(id) on delete restrict,
  fulfillment_number integer not null check (fulfillment_number > 0),
  fulfillment_status text not null check (
    fulfillment_status in (
      'pending',
      'ready_to_order',
      'ordered',
      'shipped',
      'delivered',
      'cancelled',
      'hold'
    )
  ),
  supplier text,
  supplier_order_id text,
  quantity_snapshot jsonb not null,
  carrier text,
  tracking_number text,
  ordered_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, fulfillment_number)
);

create index fulfillments_order_idx
  on commerce_v2.fulfillments (order_id, fulfillment_number desc);
create index fulfillments_active_status_idx
  on commerce_v2.fulfillments (fulfillment_status, updated_at)
  where fulfillment_status not in ('delivered', 'cancelled');

create table commerce_v2.fulfillment_events (
  id uuid primary key default gen_random_uuid(),
  fulfillment_id uuid not null
    references commerce_v2.fulfillments(id) on delete restrict,
  event_type text not null,
  previous_status text,
  new_status text,
  actor_type text not null
    check (actor_type in ('customer', 'admin', 'system', 'webhook', 'reconciliation')),
  actor_id text,
  reason text,
  event_data jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index fulfillment_events_fulfillment_idx
  on commerce_v2.fulfillment_events (fulfillment_id, occurred_at);

create table commerce_v2.order_adjustments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references commerce_v2.orders(id) on delete restrict,
  adjustment_type text not null check (
    adjustment_type in ('price', 'quantity', 'shipping', 'credit', 'refund', 'status', 'other')
  ),
  amount_delta_cents bigint,
  quantity_delta integer,
  previous_state jsonb not null,
  new_state jsonb not null,
  actor_type text not null check (actor_type in ('admin', 'system')),
  actor_id text not null,
  reason text not null check (length(trim(reason)) > 0),
  created_at timestamptz not null default now()
);

create index order_adjustments_order_created_idx
  on commerce_v2.order_adjustments (order_id, created_at);

create table commerce_v2.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references commerce_v2.orders(id) on delete restrict,
  event_type text not null,
  actor_type text not null
    check (actor_type in ('customer', 'admin', 'system', 'webhook', 'reconciliation')),
  actor_id text,
  reason text,
  previous_state jsonb,
  new_state jsonb,
  event_data jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index order_events_order_occurred_idx
  on commerce_v2.order_events (order_id, occurred_at);

create table commerce_v2.reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  run_status text not null check (run_status in ('running', 'succeeded', 'failed')),
  source text not null default 'scheduled',
  scanned_count integer not null default 0 check (scanned_count >= 0),
  mismatch_count integer not null default 0 check (mismatch_count >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_summary text
);

create index reconciliation_runs_status_started_idx
  on commerce_v2.reconciliation_runs (run_status, started_at desc);

create table commerce_v2.reconciliation_findings (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references commerce_v2.reconciliation_runs(id) on delete restrict,
  order_id uuid references commerce_v2.orders(id) on delete set null,
  payment_id uuid references commerce_v2.payments(id) on delete set null,
  finding_type text not null,
  severity text not null check (severity in ('warning', 'error')),
  human_reason text not null check (length(trim(human_reason)) > 0),
  database_snapshot jsonb,
  stripe_snapshot jsonb,
  resolution_status text not null default 'open'
    check (resolution_status in ('open', 'resolved', 'accepted_historical')),
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text,
  resolution_reason text
);

create index reconciliation_findings_open_idx
  on commerce_v2.reconciliation_findings (severity, detected_at)
  where resolution_status = 'open';
create index reconciliation_findings_order_idx
  on commerce_v2.reconciliation_findings (order_id, detected_at desc)
  where order_id is not null;
create index reconciliation_findings_payment_idx
  on commerce_v2.reconciliation_findings (payment_id, detected_at desc)
  where payment_id is not null;
create index reconciliation_findings_run_idx
  on commerce_v2.reconciliation_findings (run_id);

create table commerce_v2.legacy_imports (
  legacy_schema text not null,
  legacy_table text not null,
  legacy_id text not null,
  v2_table text not null,
  v2_id uuid not null,
  import_status text not null
    check (import_status in ('imported', 'warning', 'skipped', 'failed')),
  warning_codes text[] not null default '{}',
  imported_at timestamptz not null default now(),
  primary key (legacy_schema, legacy_table, legacy_id, v2_table)
);

create index legacy_imports_v2_idx
  on commerce_v2.legacy_imports (v2_table, v2_id);

create trigger orders_set_updated_at
before update on commerce_v2.orders
for each row execute function commerce_v2.set_updated_at();
create trigger payments_set_updated_at
before update on commerce_v2.payments
for each row execute function commerce_v2.set_updated_at();
create trigger payment_event_inbox_set_updated_at
before update on commerce_v2.payment_event_inbox
for each row execute function commerce_v2.set_updated_at();
create trigger payment_operations_set_updated_at
before update on commerce_v2.payment_operations
for each row execute function commerce_v2.set_updated_at();
create trigger prescription_verifications_set_updated_at
before update on commerce_v2.prescription_verifications
for each row execute function commerce_v2.set_updated_at();
create trigger fulfillments_set_updated_at
before update on commerce_v2.fulfillments
for each row execute function commerce_v2.set_updated_at();

create trigger order_items_append_only
before update or delete on commerce_v2.order_items
for each row execute function commerce_v2.reject_append_only_mutation();
create trigger payment_events_append_only
before update or delete on commerce_v2.payment_events
for each row execute function commerce_v2.reject_append_only_mutation();
create trigger prescription_verification_events_append_only
before update or delete on commerce_v2.prescription_verification_events
for each row execute function commerce_v2.reject_append_only_mutation();
create trigger fulfillment_events_append_only
before update or delete on commerce_v2.fulfillment_events
for each row execute function commerce_v2.reject_append_only_mutation();
create trigger order_adjustments_append_only
before update or delete on commerce_v2.order_adjustments
for each row execute function commerce_v2.reject_append_only_mutation();
create trigger order_events_append_only
before update or delete on commerce_v2.order_events
for each row execute function commerce_v2.reject_append_only_mutation();

create or replace function commerce_v2.claim_payment_event(
  p_stripe_event_id text,
  p_event_type text,
  p_stripe_object_id text,
  p_stripe_object_type text,
  p_api_version text,
  p_livemode boolean,
  p_occurred_at timestamptz,
  p_payload jsonb
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_inserted integer;
  v_status text;
  v_updated_at timestamptz;
  v_payment_id uuid;
  v_order_id uuid;
begin
  select p.id, p.order_id
  into v_payment_id, v_order_id
  from commerce_v2.payments p
  where
    p.stripe_payment_intent_id = coalesce(
      case when p_stripe_object_type = 'payment_intent'
        then p_stripe_object_id
        else null
      end,
      p_payload #>> '{data,object,payment_intent,id}',
      p_payload #>> '{data,object,payment_intent}'
    )
    or p.latest_charge_id = coalesce(
      case when p_stripe_object_type = 'charge'
        then p_stripe_object_id
        else null
      end,
      p_payload #>> '{data,object,charge,id}',
      p_payload #>> '{data,object,charge}'
    )
  limit 1;

  insert into commerce_v2.payment_events (
    stripe_event_id,
    event_type,
    stripe_object_id,
    stripe_object_type,
    api_version,
    livemode,
    occurred_at,
    signature_verified,
    payment_id,
    order_id,
    payload
  ) values (
    p_stripe_event_id,
    p_event_type,
    p_stripe_object_id,
    p_stripe_object_type,
    p_api_version,
    p_livemode,
    p_occurred_at,
    true,
    v_payment_id,
    v_order_id,
    p_payload
  )
  on conflict (stripe_event_id) do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted = 1 then
    insert into commerce_v2.payment_event_inbox (
      stripe_event_id,
      processing_status
    ) values (
      p_stripe_event_id,
      'processing'
    );
    return 'claimed';
  end if;

  select processing_status, updated_at
  into v_status, v_updated_at
  from commerce_v2.payment_event_inbox
  where stripe_event_id = p_stripe_event_id
  for update;

  if v_status = 'failed'
     or (v_status = 'processing' and v_updated_at < now() - interval '5 minutes') then
    update commerce_v2.payment_event_inbox
    set
      processing_status = 'processing',
      attempt_count = attempt_count + 1,
      claimed_at = now(),
      processed_at = null,
      last_error = null
    where stripe_event_id = p_stripe_event_id;
    return 'retry';
  end if;

  return 'duplicate';
end;
$$;

create or replace function commerce_v2.finish_payment_event(
  p_stripe_event_id text,
  p_status text,
  p_error text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_status not in ('succeeded', 'failed', 'ignored') then
    raise exception 'Invalid payment event completion status';
  end if;

  update commerce_v2.payment_event_inbox
  set
    processing_status = p_status,
    processed_at = case when p_status in ('succeeded', 'ignored') then now() else null end,
    last_error = p_error
  where stripe_event_id = p_stripe_event_id;

  if not found then
    raise exception 'Payment event % was not claimed', p_stripe_event_id;
  end if;
end;
$$;

create or replace function commerce_v2.apply_payment_projection(
  p_order_id uuid,
  p_stripe_payment_intent_id text,
  p_lifecycle_status text,
  p_currency text,
  p_authorized_amount_cents bigint,
  p_capturable_amount_cents bigint,
  p_captured_amount_cents bigint,
  p_refunded_amount_cents bigint,
  p_disputed_amount_cents bigint,
  p_latest_charge_id text,
  p_failure_code text,
  p_failure_message text,
  p_cancellation_reason text,
  p_stripe_created_at timestamptz,
  p_authorized_at timestamptz,
  p_captured_at timestamptz,
  p_cancelled_at timestamptz,
  p_failed_at timestamptz,
  p_stripe_event_id text,
  p_stripe_event_created_at timestamptz,
  p_projection_observed_at timestamptz,
  p_stripe_snapshot jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payment_id uuid;
begin
  insert into commerce_v2.payments (
    order_id,
    stripe_payment_intent_id,
    lifecycle_status,
    currency,
    authorized_amount_cents,
    capturable_amount_cents,
    captured_amount_cents,
    refunded_amount_cents,
    disputed_amount_cents,
    latest_charge_id,
    failure_code,
    failure_message,
    cancellation_reason,
    stripe_created_at,
    authorized_at,
    captured_at,
    cancelled_at,
    failed_at,
    last_stripe_event_id,
    last_stripe_event_created_at,
    last_projection_observed_at,
    stripe_snapshot
  ) values (
    p_order_id,
    p_stripe_payment_intent_id,
    p_lifecycle_status,
    upper(p_currency),
    p_authorized_amount_cents,
    p_capturable_amount_cents,
    p_captured_amount_cents,
    p_refunded_amount_cents,
    p_disputed_amount_cents,
    p_latest_charge_id,
    p_failure_code,
    p_failure_message,
    p_cancellation_reason,
    p_stripe_created_at,
    p_authorized_at,
    p_captured_at,
    p_cancelled_at,
    p_failed_at,
    p_stripe_event_id,
    p_stripe_event_created_at,
    p_projection_observed_at,
    p_stripe_snapshot
  )
  on conflict (stripe_payment_intent_id) do update
  set
    lifecycle_status = excluded.lifecycle_status,
    currency = excluded.currency,
    authorized_amount_cents = excluded.authorized_amount_cents,
    capturable_amount_cents = excluded.capturable_amount_cents,
    captured_amount_cents = excluded.captured_amount_cents,
    refunded_amount_cents = excluded.refunded_amount_cents,
    disputed_amount_cents = excluded.disputed_amount_cents,
    latest_charge_id = excluded.latest_charge_id,
    failure_code = excluded.failure_code,
    failure_message = excluded.failure_message,
    cancellation_reason = excluded.cancellation_reason,
    stripe_created_at = coalesce(commerce_v2.payments.stripe_created_at, excluded.stripe_created_at),
    authorized_at = coalesce(commerce_v2.payments.authorized_at, excluded.authorized_at),
    captured_at = coalesce(commerce_v2.payments.captured_at, excluded.captured_at),
    cancelled_at = coalesce(commerce_v2.payments.cancelled_at, excluded.cancelled_at),
    failed_at = coalesce(commerce_v2.payments.failed_at, excluded.failed_at),
    last_stripe_event_id = case
      when commerce_v2.payments.last_stripe_event_created_at is null
        or commerce_v2.payments.last_stripe_event_created_at
          <= excluded.last_stripe_event_created_at
      then excluded.last_stripe_event_id
      else commerce_v2.payments.last_stripe_event_id
    end,
    last_stripe_event_created_at = greatest(
      commerce_v2.payments.last_stripe_event_created_at,
      excluded.last_stripe_event_created_at
    ),
    last_projection_observed_at = excluded.last_projection_observed_at,
    stripe_snapshot = excluded.stripe_snapshot
  where commerce_v2.payments.last_projection_observed_at is null
     or commerce_v2.payments.last_projection_observed_at <= excluded.last_projection_observed_at
  returning id into v_payment_id;

  if v_payment_id is null then
    select id into v_payment_id
    from commerce_v2.payments
    where stripe_payment_intent_id = p_stripe_payment_intent_id;
  end if;

  -- payment_events is append-only. Its nullable links intentionally remain as
  -- received facts; consumers join through stripe_object_id when needed.

  return v_payment_id;
end;
$$;

create or replace function commerce_v2.fail_payment_operation(
  p_idempotency_key text,
  p_error text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update commerce_v2.payment_operations
  set
    operation_status = case
      when response_snapshot is null then 'failed'
      else 'stripe_succeeded'
    end,
    last_error = p_error
  where idempotency_key = p_idempotency_key;

  if not found then
    raise exception 'Payment operation not found';
  end if;
end;
$$;

create or replace function commerce_v2.apply_admin_override(
  p_order_id uuid,
  p_order_status text,
  p_actor_id text,
  p_reason text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_previous jsonb;
  v_new jsonb;
  v_adjustment_id uuid;
begin
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Admin override reason is required';
  end if;

  if p_order_status not in ('open', 'cancelled', 'completed') then
    raise exception 'Invalid order status';
  end if;

  select to_jsonb(o) into v_previous
  from commerce_v2.orders o
  where o.id = p_order_id
  for update;

  if v_previous is null then
    raise exception 'Order not found';
  end if;

  update commerce_v2.orders o
  set
    order_status = p_order_status,
    cancelled_at = case
      when p_order_status = 'cancelled' then coalesce(o.cancelled_at, now())
      else o.cancelled_at
    end,
    completed_at = case
      when p_order_status = 'completed' then coalesce(o.completed_at, now())
      else o.completed_at
    end
  where o.id = p_order_id
  returning to_jsonb(o) into v_new;

  insert into commerce_v2.order_adjustments (
    order_id,
    adjustment_type,
    previous_state,
    new_state,
    actor_type,
    actor_id,
    reason
  ) values (
    p_order_id,
    'status',
    v_previous,
    v_new,
    'admin',
    p_actor_id,
    p_reason
  )
  returning id into v_adjustment_id;

  insert into commerce_v2.order_events (
    order_id,
    event_type,
    actor_type,
    actor_id,
    reason,
    previous_state,
    new_state,
    event_data
  ) values (
    p_order_id,
    'admin_override',
    'admin',
    p_actor_id,
    p_reason,
    v_previous,
    v_new,
    jsonb_build_object('adjustment_id', v_adjustment_id)
  );

  return v_adjustment_id;
end;
$$;

create or replace view commerce_v2.order_operational_projection
with (security_invoker = true)
as
with latest_payment as (
  select distinct on (p.order_id)
    p.order_id,
    p.id as payment_id,
    p.lifecycle_status as payment_status
  from commerce_v2.payments p
  order by p.order_id, p.created_at desc
),
latest_verification as (
  select distinct on (v.order_id)
    v.order_id,
    v.id as verification_id,
    v.verification_status
  from commerce_v2.prescription_verifications v
  order by v.order_id, v.attempt_number desc
),
latest_fulfillment as (
  select distinct on (f.order_id)
    f.order_id,
    f.id as fulfillment_id,
    f.fulfillment_status
  from commerce_v2.fulfillments f
  order by f.order_id, f.fulfillment_number desc
),
open_findings as (
  select
    rf.order_id,
    count(*) as finding_count,
    min(rf.human_reason) as finding_reason
  from commerce_v2.reconciliation_findings rf
  where rf.resolution_status = 'open'
    and rf.order_id is not null
  group by rf.order_id
)
select
  o.id as order_id,
  lp.payment_id,
  lv.verification_id,
  lf.fulfillment_id,
  case
    when o.order_status = 'cancelled' then 'cancelled'
    when o.order_status = 'completed' then 'completed'
    when coalesce(ofi.finding_count, 0) > 0 then 'action_required'
    when lp.payment_status in ('failed', 'disputed', 'cancelled') then 'action_required'
    when lv.verification_status in ('rejected', 'blocked') then 'action_required'
    when lf.fulfillment_status = 'hold' then 'action_required'
    when lf.fulfillment_status in ('ordered', 'shipped', 'delivered')
      and coalesce(lv.verification_status, '') <> 'verified'
      then 'action_required'
    when lf.fulfillment_status in ('ordered', 'shipped', 'delivered')
      and coalesce(lp.payment_status, '') not in ('captured', 'partially_refunded')
      then 'action_required'
    when lp.payment_id is null
      or lp.payment_status in (
        'requires_payment_method',
        'requires_confirmation',
        'requires_action',
        'processing'
      )
      then 'awaiting_payment'
    when lp.payment_status in ('authorized', 'captured', 'partially_refunded')
      and coalesce(lv.verification_status, 'information_needed') not in ('verified')
      then 'awaiting_verification'
    when lp.payment_status = 'authorized'
      and lv.verification_status = 'verified'
      then 'action_required'
    when lp.payment_status in ('captured', 'partially_refunded')
      and lv.verification_status = 'verified'
      and coalesce(lf.fulfillment_status, 'pending') in ('pending', 'ready_to_order')
      then 'ready_to_fulfill'
    when lf.fulfillment_status in ('ordered', 'shipped') then 'in_fulfillment'
    else 'action_required'
  end as operational_queue,
  case
    when coalesce(ofi.finding_count, 0) > 0 then ofi.finding_reason
    when lp.payment_status = 'failed' then 'Stripe reports a failed payment.'
    when lp.payment_status = 'disputed' then 'The payment has an active dispute.'
    when lp.payment_status = 'cancelled' and o.order_status = 'open'
      then 'The active order references a cancelled payment.'
    when lv.verification_status = 'rejected' then 'Prescription verification was rejected.'
    when lv.verification_status = 'blocked' then 'Prescription verification is blocked.'
    when lf.fulfillment_status = 'hold' then 'Fulfillment is on hold.'
    when o.order_status = 'open'
      and lp.payment_status in ('captured', 'partially_refunded')
      and lv.verification_status <> 'verified'
      and lf.fulfillment_status in ('ordered', 'shipped', 'delivered')
      then 'Fulfillment advanced without a verified prescription.'
    when o.order_status = 'open'
      and lp.payment_status = 'authorized'
      and lf.fulfillment_status in ('ordered', 'shipped', 'delivered')
      then 'Fulfillment advanced before payment capture.'
    when o.order_status = 'open'
      and lp.payment_status = 'refunded'
      then 'An active order is fully refunded.'
    when o.order_status = 'open'
      and lp.payment_status = 'authorized'
      and lv.verification_status = 'verified'
      then 'Payment is authorized and the prescription is verified; capture is required.'
    when o.order_status = 'open'
      and lf.fulfillment_status = 'delivered'
      then 'Delivery is recorded but the order has not been completed.'
    when o.order_status = 'open'
      and lf.fulfillment_status = 'cancelled'
      then 'Fulfillment was cancelled while the order remains active.'
    when o.order_status = 'open'
      and (
        lp.payment_status is null
        or lv.verification_status is null
        or lf.fulfillment_status is null
      )
      then 'The active order is missing a required lifecycle record.'
    when o.order_status = 'open'
      then 'Order state does not map to a supported operational workflow.'
    else null
  end as action_required_reason,
  lp.payment_status,
  lv.verification_status,
  lf.fulfillment_status,
  o.order_status,
  o.placed_at
from commerce_v2.orders o
left join latest_payment lp on lp.order_id = o.id
left join latest_verification lv on lv.order_id = o.id
left join latest_fulfillment lf on lf.order_id = o.id
left join open_findings ofi on ofi.order_id = o.id;

create or replace view commerce_v2.system_health_summary
with (security_invoker = true)
as
select 'orphaned_orders'::text as metric,
       count(*) filter (
         where order_status = 'open'
           and payment_id is null
           and verification_id is null
           and fulfillment_id is null
       )::bigint as count
from commerce_v2.order_operational_projection
union all
select 'impossible_states',
       count(*) filter (
         where order_status = 'open'
           and (
             (
               fulfillment_status in ('ordered', 'shipped', 'delivered')
               and coalesce(verification_status, '') <> 'verified'
             )
             or (
               fulfillment_status in ('ordered', 'shipped', 'delivered')
               and coalesce(payment_status, '') not in ('captured', 'partially_refunded')
             )
             or payment_status = 'refunded'
           )
       )::bigint
from commerce_v2.order_operational_projection
union all
select 'stripe_database_mismatches',
       count(*)::bigint
from commerce_v2.reconciliation_findings
where resolution_status = 'open'
  and finding_type = 'stripe_database_mismatch'
union all
select 'missing_action_required_reasons',
       count(*) filter (
         where operational_queue = 'action_required'
           and action_required_reason is null
       )::bigint
from commerce_v2.order_operational_projection
union all
select 'webhook_failures',
       count(*)::bigint
from commerce_v2.payment_event_inbox
where processing_status = 'failed'
union all
select 'reconciliation_failures',
       count(*)::bigint
from commerce_v2.reconciliation_runs
where run_status = 'failed';

do $$
declare
  v_table regclass;
begin
  for v_table in
    select c.oid::regclass
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'commerce_v2'
      and c.relkind in ('r', 'p')
  loop
    execute format('alter table %s enable row level security', v_table);
    execute format('revoke all on table %s from public, anon, authenticated', v_table);
    execute format('grant select, insert, update, delete on table %s to service_role', v_table);
  end loop;
end;
$$;

revoke all on commerce_v2.order_operational_projection from public, anon, authenticated;
revoke all on commerce_v2.system_health_summary from public, anon, authenticated;
grant select on commerce_v2.order_operational_projection to service_role;
grant select on commerce_v2.system_health_summary to service_role;

revoke execute on all functions in schema commerce_v2 from public, anon, authenticated;
revoke execute on all functions in schema legacy_archive from public, anon, authenticated;
grant execute on all functions in schema commerce_v2 to service_role;
grant execute on all functions in schema legacy_archive to service_role;

alter default privileges in schema commerce_v2
  revoke all on tables from public, anon, authenticated;
alter default privileges in schema commerce_v2
  revoke execute on functions from public, anon, authenticated;
alter default privileges in schema legacy_archive
  revoke all on tables from public, anon, authenticated;
alter default privileges in schema legacy_archive
  revoke execute on functions from public, anon, authenticated;
