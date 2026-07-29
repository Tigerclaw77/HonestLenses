begin transaction read only;
set local statement_timeout = '60s';
set local lock_timeout = '5s';

with checks as (
  select
    10 as ordinal,
    'migration history is complete' as check_name,
    case when (
      select array_agg(version order by version)
      from supabase_migrations.schema_migrations
    ) = array[
      '20260721143337',
      '20260729144510',
      '20260729160750'
    ]::text[] then 'PASS' else 'FAIL' end as status,
    (
      select coalesce(string_agg(version || ':' || name, ', ' order by version), '<none>')
      from supabase_migrations.schema_migrations
    ) as evidence

  union all

  select
    20,
    'required schemas exist',
    case when
      to_regnamespace('commerce_v2') is not null
      and to_regnamespace('legacy_archive') is not null
      and to_regnamespace('security_private') is not null
      then 'PASS' else 'FAIL' end,
    format(
      'commerce_v2=%s legacy_archive=%s security_private=%s',
      to_regnamespace('commerce_v2'),
      to_regnamespace('legacy_archive'),
      to_regnamespace('security_private')
    )

  union all

  select
    30,
    'exposed admin views are absent',
    case when
      to_regclass('public.admin_orders') is null
      and to_regclass('public.admin_orders_view') is null
      then 'PASS' else 'FAIL' end,
    format(
      'admin_orders=%s admin_orders_view=%s',
      to_regclass('public.admin_orders'),
      to_regclass('public.admin_orders_view')
    )

  union all

  select
    40,
    'shared guest ownership is removed',
    case when (
      select count(*)
      from public.orders
      where user_id = '11111111-1111-4111-8111-111111111111'::uuid
    ) = 0 then 'PASS' else 'FAIL' end,
    (
      select count(*)::text
      from public.orders
      where user_id = '11111111-1111-4111-8111-111111111111'::uuid
    )

  union all

  select
    50,
    'orders remediation shape is valid',
    case when
      (
        select not a.attnotnull
        from pg_attribute a
        where a.attrelid = 'public.orders'::regclass
          and a.attname = 'user_id'
          and not a.attisdropped
      )
      and (
        select a.attnotnull
        from pg_attribute a
        where a.attrelid = 'public.orders'::regclass
          and a.attname = 'payment_attempt_generation'
          and not a.attisdropped
      )
      and not exists (
        select 1
        from public.orders
        where payment_attempt_generation <= 0
      )
      and to_regclass('public.order_resume_tokens') is not null
      then 'PASS' else 'FAIL' end,
    'expected nullable user_id, positive payment_attempt_generation, order_resume_tokens present'

  union all

  select
    60,
    'public application tables are least privilege',
    case when (
      select count(*)
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('r', 'p')
    ) = 14
      and not exists (
        select 1
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind in ('r', 'p')
          and (
            not c.relrowsecurity
            or has_table_privilege('anon', c.oid, 'select,insert,update,delete')
            or has_table_privilege('authenticated', c.oid, 'select,insert,update,delete')
            or not has_table_privilege('service_role', c.oid, 'select,insert,update,delete')
          )
      )
      then 'PASS' else 'FAIL' end,
    'expected 14 RLS tables, no anon/auth DML, full service-role DML'

  union all

  select
    70,
    'public functions are least privilege',
    case when not exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prokind = 'f'
        and (
          has_function_privilege('anon', p.oid, 'execute')
          or has_function_privilege('authenticated', p.oid, 'execute')
          or not has_function_privilege('service_role', p.oid, 'execute')
          or (
            p.prosecdef
            and not coalesce(p.proconfig, '{}'::text[])
              @> array['search_path=""']
          )
        )
    ) then 'PASS' else 'FAIL' end,
    'expected no anon/auth execute; service execute; pinned search_path for definers'

  union all

  select
    80,
    'prescriptions bucket is restricted',
    case when (
      select count(*)
      from storage.buckets
      where id = 'prescriptions'
        and public = false
        and file_size_limit = 10485760
        and allowed_mime_types = array['image/jpeg', 'image/png']::text[]
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

  union all

  select
    90,
    'Commerce v2 tables are least privilege',
    case when (
      select count(*)
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'commerce_v2'
        and c.relkind in ('r', 'p')
    ) = 15
      and not has_schema_privilege('anon', 'commerce_v2', 'usage')
      and not has_schema_privilege('authenticated', 'commerce_v2', 'usage')
      and has_schema_privilege('service_role', 'commerce_v2', 'usage')
      and not exists (
        select 1
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'commerce_v2'
          and c.relkind in ('r', 'p')
          and (
            not c.relrowsecurity
            or has_table_privilege('anon', c.oid, 'select,insert,update,delete')
            or has_table_privilege('authenticated', c.oid, 'select,insert,update,delete')
            or not has_table_privilege('service_role', c.oid, 'select,insert,update,delete')
          )
      )
      then 'PASS' else 'FAIL' end,
    'expected 15 RLS tables, server-only schema/table access'

  union all

  select
    100,
    'Commerce v2 views are security invoker',
    case when (
      select count(*)
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'commerce_v2'
        and c.relkind = 'v'
        and coalesce(c.reloptions, '{}'::text[])
          @> array['security_invoker=true']
    ) = 2 then 'PASS' else 'FAIL' end,
    'expected two security_invoker views'

  union all

  select
    110,
    'Commerce v2 remains empty',
    case when (
      (select count(*) from commerce_v2.orders)
      + (select count(*) from commerce_v2.order_items)
      + (select count(*) from commerce_v2.payments)
      + (select count(*) from commerce_v2.payment_events)
      + (select count(*) from commerce_v2.payment_event_inbox)
      + (select count(*) from commerce_v2.payment_operations)
      + (select count(*) from commerce_v2.prescription_verifications)
      + (select count(*) from commerce_v2.prescription_verification_events)
      + (select count(*) from commerce_v2.fulfillments)
      + (select count(*) from commerce_v2.fulfillment_events)
      + (select count(*) from commerce_v2.order_adjustments)
      + (select count(*) from commerce_v2.order_events)
      + (select count(*) from commerce_v2.reconciliation_runs)
      + (select count(*) from commerce_v2.reconciliation_findings)
      + (select count(*) from commerce_v2.legacy_imports)
    ) = 0 then 'PASS' else 'FAIL' end,
    (
      (select count(*) from commerce_v2.orders)
      + (select count(*) from commerce_v2.order_items)
      + (select count(*) from commerce_v2.payments)
      + (select count(*) from commerce_v2.payment_events)
      + (select count(*) from commerce_v2.payment_event_inbox)
      + (select count(*) from commerce_v2.payment_operations)
      + (select count(*) from commerce_v2.prescription_verifications)
      + (select count(*) from commerce_v2.prescription_verification_events)
      + (select count(*) from commerce_v2.fulfillments)
      + (select count(*) from commerce_v2.fulfillment_events)
      + (select count(*) from commerce_v2.order_adjustments)
      + (select count(*) from commerce_v2.order_events)
      + (select count(*) from commerce_v2.reconciliation_runs)
      + (select count(*) from commerce_v2.reconciliation_findings)
      + (select count(*) from commerce_v2.legacy_imports)
    )::text

  union all

  select
    120,
    'application objects are owned by postgres',
    case when not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in (
        'public',
        'commerce_v2',
        'legacy_archive',
        'security_private'
      )
        and c.relkind in ('r', 'p', 'v', 'm', 'S')
        and pg_get_userbyid(c.relowner) <> 'postgres'
    ) and not exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in (
        'public',
        'commerce_v2',
        'legacy_archive',
        'security_private'
      )
        and p.prokind in ('f', 'p')
        and pg_get_userbyid(p.proowner) <> 'postgres'
    ) then 'PASS' else 'FAIL' end,
    'expected owner=postgres'
)
select ordinal, check_name, status, evidence
from checks
order by ordinal;

rollback;
