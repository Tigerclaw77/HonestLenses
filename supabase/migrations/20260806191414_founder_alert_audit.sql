create table if not exists public.order_founder_alerts (
  alert_key text primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  alert_type text not null,
  recipient text not null,
  resend_email_id text,
  created_at timestamptz not null default now()
);

create index if not exists order_founder_alerts_order_id_idx
  on public.order_founder_alerts(order_id, created_at desc);

alter table public.order_founder_alerts enable row level security;

revoke all on table public.order_founder_alerts from public, anon, authenticated;
grant select, insert, update on table public.order_founder_alerts to service_role;
