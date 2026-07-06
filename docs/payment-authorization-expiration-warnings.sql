-- Dedupe table for Stripe manual-capture authorization expiration warnings.
-- Run this once in Supabase before enabling /api/cron/payment-authorization-expiration.

create table if not exists public.payment_authorization_expiration_warnings (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  payment_intent_id text not null,
  warning_level text not null check (warning_level in ('72h', '24h')),
  authorization_expires_at timestamptz not null,
  generated_at timestamptz not null default now(),
  sent_at timestamptz,
  email_to text,
  email_subject text,
  error_message text
);

create unique index if not exists payment_authorization_expiration_warnings_once
  on public.payment_authorization_expiration_warnings (
    order_id,
    payment_intent_id,
    warning_level
  );

create index if not exists payment_authorization_expiration_warnings_order_id_idx
  on public.payment_authorization_expiration_warnings (order_id);
