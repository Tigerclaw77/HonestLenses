-- Prospective checkout choices are separate from orders and existing recall schedules.
-- An unchecked box creates no row; unsubscribes remain in commercial_email_suppressions.
create table public.customer_reminder_choices (
  order_id uuid primary key references public.orders(id) on delete cascade,
  customer_email text not null,
  email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  decision text not null check (decision in ('requested', 'declined')),
  recorded_at timestamptz not null default now(),
  wording text not null,
  wording_version text not null,
  privacy_policy_version text not null,
  source text not null check (source = 'checkout'),
  categories text[] not null check (
    categories = array['replenishment', 'prescription_expiration']::text[]
  ),
  payment_intent_id text not null unique
);
create index customer_reminder_choices_email_idx
  on public.customer_reminder_choices(email_hash, recorded_at desc);

alter table public.customer_reminder_choices enable row level security;
revoke all on table public.customer_reminder_choices from public, anon, authenticated;
grant select, insert on table public.customer_reminder_choices to service_role;
