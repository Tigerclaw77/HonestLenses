create table if not exists public.inbound_email_forwards (
  svix_id text primary key,
  resend_received_email_id text not null unique,
  sender text,
  recipient text,
  received_at timestamptz not null,
  forwarding_started_at timestamptz,
  forwarded_email_id text,
  forwarded_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inbound_email_forwards_received_at_idx
  on public.inbound_email_forwards(received_at desc);

alter table public.inbound_email_forwards enable row level security;

revoke all on public.inbound_email_forwards from public, anon, authenticated;
grant select, insert, update on public.inbound_email_forwards to service_role;
