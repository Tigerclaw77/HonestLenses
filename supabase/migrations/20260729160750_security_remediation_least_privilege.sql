-- Local remediation only. Do not apply without a reviewed maintenance plan.
-- This migration removes the confirmed anonymous admin-view exposure and the
-- shared guest Auth ownership model while preserving server-side admin routes.

do $$
begin
  if to_regclass('public.admin_orders') is not null then
    execute
      'revoke all privileges on table public.admin_orders '
      'from public, anon, authenticated';
  end if;
  if to_regclass('public.admin_orders_view') is not null then
    execute
      'revoke all privileges on table public.admin_orders_view '
      'from public, anon, authenticated';
  end if;
end
$$;

drop view if exists public.admin_orders_view;
drop view if exists public.admin_orders;

-- A guest order is owned by its expiring, order-scoped application session.
-- Authenticated customer orders continue to use orders.user_id and RLS.
alter table public.orders alter column user_id drop not null;
alter table public.orders
  add column if not exists payment_attempt_generation integer
  not null default 1
  check (payment_attempt_generation > 0);
update public.orders
set user_id = null
where user_id = '11111111-1111-4111-8111-111111111111'::uuid;

create table if not exists public.order_resume_tokens (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index if not exists order_resume_tokens_active_idx
  on public.order_resume_tokens (token_hash, expires_at)
  where used_at is null;

alter table public.order_resume_tokens enable row level security;
revoke all on table public.order_resume_tokens
  from public, anon, authenticated;
grant select, insert, update, delete on table public.order_resume_tokens
  to service_role;

-- Direct callers do not need trigger/calendar helpers as Data API methods.
do $$
declare
  function_signature regprocedure;
begin
  for function_signature in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'calculate_passive_deadline',
        'generate_federal_holidays',
        'insert_holiday',
        'update_updated_at'
      )
  loop
    execute format(
      'revoke all privileges on function %s from public, anon, authenticated',
      function_signature
    );
    execute format(
      'grant execute on function %s to service_role',
      function_signature
    );
  end loop;
end
$$;

-- The storage API rejects oversized or unexpected prescription objects before
-- any application worker can read them.
update storage.buckets
set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array[
    'image/jpeg',
    'image/png'
  ]::text[]
where id = 'prescriptions';

-- The browser uses Supabase for Auth only. All application-data access passes
-- through server routes that enforce the canonical authorization policy.
-- Explicitly remove legacy Data API access instead of depending on unknown
-- historical grants or policies. RLS remains enabled as defense in depth.
do $$
declare
  relation_name text;
  relation_id regclass;
begin
  foreach relation_name in array array[
    'public.orders',
    'public.order_items',
    'public.order_events',
    'public.patients',
    'public.user_patients',
    'public.profiles',
    'public.addresses',
    'public.product_interest',
    'public.resolver_audits',
    'public.federal_holidays',
    'public.site_reminders',
    'public.order_email_deliveries',
    'public.resend_webhook_events',
    'public.order_resume_tokens'
  ]
  loop
    relation_id := to_regclass(relation_name);
    if relation_id is not null then
      execute format('alter table %s enable row level security', relation_id);
      execute format(
        'revoke all privileges on table %s from public, anon, authenticated',
        relation_id
      );
      execute format(
        'grant select, insert, update, delete on table %s to service_role',
        relation_id
      );
    end if;
  end loop;
end
$$;

revoke all privileges on all sequences in schema public
  from public, anon, authenticated;
grant usage, select on all sequences in schema public to service_role;

revoke execute on all functions in schema public
  from public, anon, authenticated;
grant execute on all functions in schema public to service_role;

-- Prevent a future migration from silently recreating broad public surfaces.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from public, anon, authenticated;
-- PostgreSQL grants EXECUTE on new functions to PUBLIC as a global built-in
-- default. A schema-scoped REVOKE cannot remove that global default.
alter default privileges for role postgres
  revoke execute on functions from public;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to service_role;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to service_role;

create schema if not exists security_private;
revoke all on schema security_private from public, anon, authenticated;

create table if not exists security_private.rate_limit_buckets (
  bucket_key text primary key,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  updated_at timestamptz not null default now()
);

alter table security_private.rate_limit_buckets enable row level security;
revoke all on table security_private.rate_limit_buckets
  from public, anon, authenticated;

create or replace function public.consume_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_window timestamptz;
  resulting_count integer;
begin
  if
    length(p_bucket_key) < 20
    or length(p_bucket_key) > 200
    or p_limit < 1
    or p_limit > 10000
    or p_window_seconds < 1
    or p_window_seconds > 86400
  then
    raise exception 'invalid rate limit arguments';
  end if;

  current_window := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds)
    * p_window_seconds
  );

  insert into security_private.rate_limit_buckets (
    bucket_key,
    window_started_at,
    request_count,
    updated_at
  )
  values (p_bucket_key, current_window, 1, clock_timestamp())
  on conflict (bucket_key) do update
  set
    window_started_at = case
      when security_private.rate_limit_buckets.window_started_at
        = excluded.window_started_at
      then security_private.rate_limit_buckets.window_started_at
      else excluded.window_started_at
    end,
    request_count = case
      when security_private.rate_limit_buckets.window_started_at
        = excluded.window_started_at
      then security_private.rate_limit_buckets.request_count + 1
      else 1
    end,
    updated_at = clock_timestamp()
  returning request_count into resulting_count;

  return resulting_count <= p_limit;
end
$$;

revoke all on function public.consume_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer)
  to service_role;
