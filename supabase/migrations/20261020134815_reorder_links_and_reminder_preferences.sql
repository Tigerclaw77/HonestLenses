-- A receipt entry token identifies an order but never grants access to it.
-- Only the server role may read these tables. All customer data stays in orders.
create table public.reorder_entry_links (
  order_id uuid primary key references public.orders(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table public.reorder_auth_tokens (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.reorder_entry_links(order_id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  recipient_hash text not null check (recipient_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);
create index reorder_auth_tokens_active_idx
  on public.reorder_auth_tokens (token_hash, expires_at)
  where used_at is null;

-- Provenance connects a new cart to its source. It does not confer Rx verification.
create table public.reorder_drafts (
  draft_order_id uuid primary key references public.orders(id) on delete cascade,
  source_order_id uuid not null references public.orders(id),
  created_at timestamptz not null default now(),
  check (draft_order_id <> source_order_id)
);

-- Reminder data is inert until a separately reviewed sender is enabled.
create table public.reorder_reminder_preferences (
  order_id uuid primary key references public.orders(id) on delete cascade,
  email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  next_reminder_at timestamptz,
  stopped_at timestamptz,
  last_sent_at timestamptz,
  send_count integer not null default 0 check (send_count >= 0),
  updated_at timestamptz not null default now()
);
create index reorder_reminder_due_idx
  on public.reorder_reminder_preferences (next_reminder_at)
  where stopped_at is null and next_reminder_at is not null;

create table public.reorder_reminder_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  event_type text not null check (event_type in
    ('scheduled','postponed','stopped','suppressed','queued','accepted','delivered','bounced','failed','canceled')),
  event_key text not null unique,
  occurred_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb
);

create table public.reorder_reminder_control_tokens (
  order_id uuid not null references public.orders(id) on delete cascade,
  action text not null check (action in ('postpone_30','postpone_60','postpone_90','custom','stop')),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (order_id, action)
);

create table public.reorder_reminder_attempts (
  order_id uuid not null references public.orders(id) on delete cascade,
  scheduled_for timestamptz not null,
  status text not null default 'claimed' check (status in ('claimed','accepted','rejected','unknown')),
  provider_id text,
  error_code text,
  claimed_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (order_id, scheduled_for)
);

alter table public.order_operations_control
  add column reorder_reminders_enabled boolean not null default false;

do $$ declare name text; begin
  foreach name in array array[
    'reorder_entry_links','reorder_auth_tokens','reorder_drafts',
    'reorder_reminder_preferences','reorder_reminder_events',
    'reorder_reminder_control_tokens','reorder_reminder_attempts'
  ] loop
    execute format('alter table public.%I enable row level security', name);
    execute format('revoke all on table public.%I from public, anon, authenticated', name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', name);
  end loop;
end $$;

-- Only one request can consume a short-lived authorization token.
create function public.consume_reorder_auth_token(p_hash text)
returns table(order_id uuid, recipient_hash text)
language sql security invoker set search_path = public as $$
  update public.reorder_auth_tokens t
  set used_at = now()
  from public.reorder_entry_links e
  where t.order_id = e.order_id
    and t.token_hash = p_hash
    and t.used_at is null
    and t.expires_at > now()
    and e.revoked_at is null
  returning t.order_id, t.recipient_hash;
$$;
revoke all on function public.consume_reorder_auth_token(text) from public, anon, authenticated;
grant execute on function public.consume_reorder_auth_token(text) to service_role;

create unique index order_events_reorder_prescription_reused_once
  on public.order_events (order_id)
  where event_type = 'reorder_prescription_reused';
