begin transaction read only;
set local statement_timeout = '60s';
set local lock_timeout = '5s';

with checks as (
  select
    10 as ordinal,
    'migration history is exact' as check_name,
    case when (
      select array_agg(version order by version)
      from supabase_migrations.schema_migrations
    ) = array['20260721143337']::text[]
      then 'PASS' else 'FAIL' end as status,
    (
      select coalesce(string_agg(version || ':' || name, ', ' order by version), '<none>')
      from supabase_migrations.schema_migrations
    ) as evidence

  union all

  select
    20,
    'historical Resend SQL matches repository',
    case when exists (
      select 1
      from supabase_migrations.schema_migrations
      where version = '20260721143337'
        and encode(
          digest(
            regexp_replace(lower(statements[1]), '\s+', '', 'g'),
            'sha256'
          ),
          'hex'
        ) = '2679bc10999c331892f71b34a4ee90185f65aaebd87f5ed3d3995993ccce5e1d'
    ) then 'PASS' else 'FAIL' end,
    'expected canonical SHA-256 2679bc10999c331892f71b34a4ee90185f65aaebd87f5ed3d3995993ccce5e1d'

  union all

  select
    30,
    'pending schemas are absent',
    case when
      to_regnamespace('commerce_v2') is null
      and to_regnamespace('legacy_archive') is null
      and to_regnamespace('security_private') is null
      then 'PASS' else 'FAIL' end,
    format(
      'commerce_v2=%s legacy_archive=%s security_private=%s',
      to_regnamespace('commerce_v2'),
      to_regnamespace('legacy_archive'),
      to_regnamespace('security_private')
    )

  union all

  select
    40,
    'public table inventory is exact',
    case when (
      select array_agg(c.relname::text order by c.relname)
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('r', 'p')
    ) = array[
      'addresses',
      'federal_holidays',
      'order_email_deliveries',
      'order_events',
      'order_items',
      'orders',
      'patients',
      'product_interest',
      'profiles',
      'resend_webhook_events',
      'resolver_audits',
      'site_reminders',
      'user_patients'
    ]::text[]
      then 'PASS' else 'FAIL' end,
    (
      select coalesce(string_agg(c.relname, ', ' order by c.relname), '<none>')
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('r', 'p')
    )

  union all

  select
    50,
    'public views are exact',
    case when (
      select array_agg(c.relname::text order by c.relname)
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'v'
    ) = array['admin_orders', 'admin_orders_view']::text[]
      then 'PASS' else 'FAIL' end,
    (
      select coalesce(string_agg(c.relname, ', ' order by c.relname), '<none>')
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'v'
    )

  union all

  select
    60,
    'public functions are exact',
    case when (
      select array_agg(p.proname::text order by p.proname)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prokind = 'f'
    ) = array[
      'apply_resend_delivery_event',
      'calculate_passive_deadline',
      'generate_federal_holidays',
      'insert_holiday',
      'record_transactional_email_send',
      'update_updated_at'
    ]::text[]
      then 'PASS' else 'FAIL' end,
    (
      select coalesce(
        string_agg(
          p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
          ', '
          order by p.proname, pg_get_function_identity_arguments(p.oid)
        ),
        '<none>'
      )
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prokind = 'f'
    )

  union all

  select
    70,
    'order_status enum is exact',
    case when (
      select array_agg(
        enum_row.enumlabel::text
        order by enum_row.enumsortorder
      )
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
      join pg_enum enum_row on enum_row.enumtypid = t.oid
      where n.nspname = 'public'
        and t.typname = 'order_status'
    ) = array[
      'draft',
      'pending',
      'verified',
      'rejected',
      'cancelled',
      'fulfilled',
      'returned',
      'authorized',
      'captured'
    ]::text[]
      then 'PASS' else 'FAIL' end,
    'draft,pending,verified,rejected,cancelled,fulfilled,returned,authorized,captured'

  union all

  select
    80,
    'orders update trigger is exact',
    case when (
      select count(*)
      from pg_trigger trigger_row
      join pg_class c on c.oid = trigger_row.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where not trigger_row.tgisinternal
        and n.nspname = 'public'
        and c.relname = 'orders'
        and trigger_row.tgname = 'orders_updated_at'
        and trigger_row.tgtype = 19
        and trigger_row.tgenabled = 'O'
        and trigger_row.tgfoid = 'public.update_updated_at()'::regprocedure
    ) = 1 then 'PASS' else 'FAIL' end,
    coalesce(
      (
        select pg_get_triggerdef(trigger_row.oid, true)
        from pg_trigger trigger_row
        join pg_class c on c.oid = trigger_row.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
        where not trigger_row.tgisinternal
          and n.nspname = 'public'
          and c.relname = 'orders'
          and trigger_row.tgname = 'orders_updated_at'
      ),
      '<missing>'
    )

  union all

  select
    90,
    'public ownership is postgres',
    case when not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('r', 'p', 'v', 'm', 'S')
        and pg_get_userbyid(c.relowner) <> 'postgres'
    ) and not exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prokind in ('f', 'p')
        and pg_get_userbyid(p.proowner) <> 'postgres'
    ) then 'PASS' else 'FAIL' end,
    'expected owner=postgres for every public application relation and function'

  union all

  select
    100,
    'all public application tables have RLS',
    case when not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('r', 'p')
        and not c.relrowsecurity
    ) then 'PASS' else 'FAIL' end,
    (
      select coalesce(
        string_agg(c.relname, ', ' order by c.relname),
        '<none>'
      )
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('r', 'p')
        and not c.relrowsecurity
    )

  union all

  select
    110,
    'pre-remediation orders shape is intact',
    case when
      (
        select a.attnotnull
        from pg_attribute a
        where a.attrelid = 'public.orders'::regclass
          and a.attname = 'user_id'
          and not a.attisdropped
      )
      and not exists (
        select 1
        from pg_attribute a
        where a.attrelid = 'public.orders'::regclass
          and a.attname = 'payment_attempt_generation'
          and not a.attisdropped
      )
      and to_regclass('public.order_resume_tokens') is null
      then 'PASS' else 'FAIL' end,
    'expected user_id NOT NULL, no payment_attempt_generation, no order_resume_tokens'

  union all

  select
    120,
    'prescriptions bucket matches reviewed pre-migration state',
    case when (
      select count(*)
      from storage.buckets
      where id = 'prescriptions'
        and public = false
        and file_size_limit is null
        and allowed_mime_types is null
    ) = 1 then 'PASS' else 'FAIL' end,
    coalesce(
      (
        select format(
          'public=%s file_size_limit=%s allowed_mime_types=%s',
          public,
          file_size_limit,
          allowed_mime_types
        )
        from storage.buckets
        where id = 'prescriptions'
      ),
      '<missing>'
    )
)
select ordinal, check_name, status, evidence
from checks
order by ordinal;

rollback;
