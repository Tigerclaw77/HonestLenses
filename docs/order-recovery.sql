-- Guest order recovery tokens used by /resume-order.
-- Run once against Supabase before enabling email recovery in production.

create table if not exists public.order_resume_tokens (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists order_resume_tokens_order_id_idx
  on public.order_resume_tokens(order_id);

create index if not exists order_resume_tokens_email_created_at_idx
  on public.order_resume_tokens(email, created_at desc);

create index if not exists order_resume_tokens_unused_expiry_idx
  on public.order_resume_tokens(expires_at)
  where used_at is null;

alter table public.order_resume_tokens enable row level security;
