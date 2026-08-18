-- Disposable validation fixture only.
--
-- This is not a production migration and contains no production data. It
-- reproduces the Supabase roles, Auth helper, storage bucket shape, legacy
-- application objects, and the intentionally vulnerable pre-remediation
-- grants needed to execute and attack the security migration in isolation.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;

create schema if not exists auth;
revoke all on schema auth from public, anon, authenticated;

create or replace function auth.uid()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to service_role;
grant execute on function auth.uid() to service_role;

create schema if not exists storage;
revoke all on schema storage from public, anon, authenticated;

create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

insert into storage.buckets (id, name, public)
values ('prescriptions', 'prescriptions', false);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets(id),
  name text not null,
  owner_id uuid
);
alter table storage.objects enable row level security;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  status text not null default 'draft',
  customer_email text,
  stripe_payment_intent_id text,
  rx jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade
);

create table public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  event_type text
);

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  name text
);

create table public.user_patients (
  user_id uuid not null,
  patient_id uuid not null references public.patients(id),
  primary key (user_id, patient_id)
);

create table public.profiles (
  id uuid primary key,
  marketing_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  city text
);

create table public.product_interest (
  id bigint generated always as identity primary key,
  email text
);

create table public.resolver_audits (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now()
);

create table public.federal_holidays (
  holiday_date date primary key,
  name text not null
);

create table public.site_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid
);

alter table public.orders enable row level security;
create policy orders_customer_select
on public.orders
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy orders_customer_update
on public.orders
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

insert into public.orders (
  id,
  user_id,
  customer_email,
  stripe_payment_intent_id,
  rx
)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-0000-4000-8000-000000000001',
    'customer-a@example.invalid',
    'pi_test_customer_a',
    '{"status":"pending"}'
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'bbbbbbbb-0000-4000-8000-000000000002',
    'customer-b@example.invalid',
    'pi_test_customer_b',
    '{"status":"pending"}'
  ),
  (
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '11111111-1111-4111-8111-111111111111',
    'guest@example.invalid',
    null,
    null
  );

create view public.admin_orders
as
select * from public.orders;

create view public.admin_orders_view
as
select * from public.orders;

create or replace function public.calculate_passive_deadline(
  p_started_at timestamptz
)
returns timestamptz
language sql
security invoker
set search_path = ''
as $$
  select p_started_at + interval '8 hours'
$$;

create or replace function public.generate_federal_holidays()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return;
end
$$;

create or replace function public.insert_holiday(
  p_holiday_date date,
  p_name text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.federal_holidays (holiday_date, name)
  values (p_holiday_date, p_name)
  on conflict (holiday_date) do nothing;
end
$$;

create or replace function public.update_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public
  to anon, authenticated, service_role;
grant usage, select on all sequences in schema public
  to anon, authenticated, service_role;
grant execute on all functions in schema public
  to public, anon, authenticated, service_role;

grant all privileges on public.admin_orders
  to anon, authenticated, service_role;
grant all privileges on public.admin_orders_view
  to anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables
  to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant usage, select on sequences
  to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant execute on functions
  to public, anon, authenticated, service_role;
