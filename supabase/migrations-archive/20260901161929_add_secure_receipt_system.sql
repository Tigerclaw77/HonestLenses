alter table public.orders
  add column if not exists customer_order_number text;

create unique index if not exists orders_customer_order_number_unique_idx
  on public.orders (customer_order_number)
  where customer_order_number is not null;

create table if not exists public.order_receipt_snapshots (
  order_id uuid primary key references public.orders(id) on delete restrict,
  customer_order_number text not null unique,
  snapshot_version smallint not null default 1 check (snapshot_version = 1),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  captured_amount_cents bigint not null check (captured_amount_cents > 0),
  currency text not null check (currency = upper(currency) and length(currency) = 3),
  captured_at timestamptz not null,
  source text not null check (source in ('capture', 'stripe_webhook', 'historical_reconstruction')),
  created_at timestamptz not null default now()
);

create table if not exists public.order_receipt_access_tokens (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  token_hash text not null unique,
  purpose text not null check (purpose in ('confirmation', 'order_status', 'retrieval')),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_accessed_at timestamptz,
  delivery_status text not null default 'not_applicable'
    check (delivery_status in ('not_applicable', 'pending', 'sent', 'failed')),
  delivery_attempted_at timestamptz,
  delivery_error_code text,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index if not exists order_receipt_access_tokens_active_idx
  on public.order_receipt_access_tokens (token_hash, expires_at)
  where revoked_at is null;

create index if not exists order_receipt_access_tokens_order_idx
  on public.order_receipt_access_tokens (order_id, purpose, created_at desc);

alter table public.order_receipt_snapshots enable row level security;
alter table public.order_receipt_access_tokens enable row level security;

revoke all on table public.order_receipt_snapshots
  from public, anon, authenticated;
revoke all on table public.order_receipt_access_tokens
  from public, anon, authenticated;

grant select, insert, update, delete on table public.order_receipt_snapshots to service_role;
grant select, insert, update, delete on table public.order_receipt_access_tokens to service_role;

create or replace function security_private.reject_receipt_snapshot_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'receipt snapshots are immutable' using errcode = '55000';
end
$$;

revoke execute on function security_private.reject_receipt_snapshot_mutation()
  from public, anon, authenticated;
grant execute on function security_private.reject_receipt_snapshot_mutation()
  to service_role;

drop trigger if exists order_receipt_snapshots_immutable
  on public.order_receipt_snapshots;
create trigger order_receipt_snapshots_immutable
before update or delete on public.order_receipt_snapshots
for each row execute function security_private.reject_receipt_snapshot_mutation();

comment on table public.order_receipt_snapshots is
  'Server-only immutable, data-minimized paid receipt facts captured at payment completion.';
comment on table public.order_receipt_access_tokens is
  'Server-only hashes of expiring and revocable customer receipt capabilities; plaintext tokens are never stored.';
