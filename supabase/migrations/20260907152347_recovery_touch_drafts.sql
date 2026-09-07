-- Drafts only: no delivery capability or customer campaign is activated.
create table public.recovery_touch_drafts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  touch_hours integer not null check (touch_hours in (1, 24)),
  email text not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  activity_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  state text not null default 'pending_founder_approval' check (state = 'pending_founder_approval'),
  unique (order_id, touch_hours),
  check (expires_at > created_at)
);
alter table public.recovery_touch_drafts enable row level security;
revoke all on table public.recovery_touch_drafts from public, anon, authenticated, service_role;
grant select, insert on table public.recovery_touch_drafts to service_role;
comment on table public.recovery_touch_drafts is
  'Auditable, deduplicated non-delivery recovery proposals. Never a send queue. Tokens are hashed, email-bound, expiring, and revalidate live order/payment state on use.';
