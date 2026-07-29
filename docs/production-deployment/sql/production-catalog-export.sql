begin transaction isolation level repeatable read read only;
set local statement_timeout = '120s';
set local lock_timeout = '5s';

select jsonb_pretty(
  jsonb_build_object(
    'capture',
    jsonb_build_object(
      'captured_at_utc', clock_timestamp(),
      'database', current_database(),
      'database_user', current_user,
      'server_version', current_setting('server_version'),
      'transaction_read_only', current_setting('transaction_read_only')
    ),
    'extensions',
    (
      select coalesce(jsonb_agg(to_jsonb(e) order by e.name), '[]'::jsonb)
      from (
        select
          ext.extname as name,
          ext.extversion as version,
          n.nspname as schema_name
        from pg_extension ext
        join pg_namespace n on n.oid = ext.extnamespace
        order by ext.extname
      ) e
    ),
    'roles',
    (
      select coalesce(jsonb_agg(to_jsonb(r) order by r.name), '[]'::jsonb)
      from (
        select
          rolname as name,
          rolsuper as superuser,
          rolcreaterole as create_role,
          rolcreatedb as create_database,
          rolcanlogin as can_login,
          rolreplication as replication,
          rolbypassrls as bypass_rls
        from pg_roles
        order by rolname
      ) r
    ),
    'role_memberships',
    (
      select coalesce(
        jsonb_agg(to_jsonb(m) order by m.member_name, m.role_name),
        '[]'::jsonb
      )
      from (
        select
          member_role.rolname as member_name,
          granted_role.rolname as role_name,
          membership.admin_option
        from pg_auth_members membership
        join pg_roles member_role on member_role.oid = membership.member
        join pg_roles granted_role on granted_role.oid = membership.roleid
        order by member_role.rolname, granted_role.rolname
      ) m
    ),
    'schemas',
    (
      select coalesce(
        jsonb_agg(to_jsonb(s) order by s.schema_name),
        '[]'::jsonb
      )
      from (
        select
          n.nspname as schema_name,
          pg_get_userbyid(n.nspowner) as owner
        from pg_namespace n
        where n.nspname in (
          'public',
          'commerce_v2',
          'legacy_archive',
          'security_private'
        )
        order by n.nspname
      ) s
    ),
    'relations',
    (
      select coalesce(
        jsonb_agg(
          to_jsonb(r)
          order by r.schema_name, r.relation_name
        ),
        '[]'::jsonb
      )
      from (
        select
          n.nspname as schema_name,
          c.relname as relation_name,
          case c.relkind
            when 'r' then 'table'
            when 'p' then 'partitioned_table'
            when 'v' then 'view'
            when 'm' then 'materialized_view'
            when 'S' then 'sequence'
            else c.relkind::text
          end as relation_type,
          pg_get_userbyid(c.relowner) as owner,
          c.relrowsecurity as rls_enabled,
          c.relforcerowsecurity as rls_forced,
          c.reloptions
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname in (
          'public',
          'commerce_v2',
          'legacy_archive',
          'security_private'
        )
          and c.relkind in ('r', 'p', 'v', 'm', 'S')
        order by n.nspname, c.relname
      ) r
    ),
    'columns',
    (
      select coalesce(
        jsonb_agg(
          to_jsonb(col)
          order by col.schema_name, col.relation_name, col.ordinal
        ),
        '[]'::jsonb
      )
      from (
        select
          n.nspname as schema_name,
          c.relname as relation_name,
          a.attnum as ordinal,
          a.attname as column_name,
          pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type,
          a.attnotnull as not_null,
          pg_get_expr(d.adbin, d.adrelid) as default_expression,
          a.attidentity as identity_kind,
          a.attgenerated as generated_kind
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        join pg_attribute a
          on a.attrelid = c.oid
         and a.attnum > 0
         and not a.attisdropped
        left join pg_attrdef d
          on d.adrelid = c.oid
         and d.adnum = a.attnum
        where n.nspname in (
          'public',
          'commerce_v2',
          'legacy_archive',
          'security_private'
        )
          and c.relkind in ('r', 'p', 'v', 'm')
        order by n.nspname, c.relname, a.attnum
      ) col
    ),
    'constraints',
    (
      select coalesce(
        jsonb_agg(
          to_jsonb(con)
          order by con.schema_name, con.relation_name, con.constraint_name
        ),
        '[]'::jsonb
      )
      from (
        select
          n.nspname as schema_name,
          c.relname as relation_name,
          constraint_row.conname as constraint_name,
          constraint_row.contype as constraint_type,
          constraint_row.convalidated as validated,
          pg_get_constraintdef(constraint_row.oid, true) as definition
        from pg_constraint constraint_row
        join pg_class c on c.oid = constraint_row.conrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname in (
          'public',
          'commerce_v2',
          'legacy_archive',
          'security_private'
        )
        order by n.nspname, c.relname, constraint_row.conname
      ) con
    ),
    'indexes',
    (
      select coalesce(
        jsonb_agg(
          to_jsonb(i)
          order by i.schema_name, i.relation_name, i.index_name
        ),
        '[]'::jsonb
      )
      from (
        select
          schemaname as schema_name,
          tablename as relation_name,
          indexname as index_name,
          indexdef as definition
        from pg_indexes
        where schemaname in (
          'public',
          'commerce_v2',
          'legacy_archive',
          'security_private'
        )
        order by schemaname, tablename, indexname
      ) i
    ),
    'functions',
    (
      select coalesce(
        jsonb_agg(
          to_jsonb(f)
          order by f.schema_name, f.function_name, f.identity_arguments
        ),
        '[]'::jsonb
      )
      from (
        select
          n.nspname as schema_name,
          p.proname as function_name,
          pg_get_function_identity_arguments(p.oid) as identity_arguments,
          p.prokind as function_kind,
          pg_get_userbyid(p.proowner) as owner,
          p.prosecdef as security_definer,
          p.proconfig as configuration,
          p.proacl::text as acl,
          pg_get_functiondef(p.oid) as definition
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in (
          'public',
          'commerce_v2',
          'legacy_archive',
          'security_private'
        )
          and p.prokind in ('f', 'p')
        order by n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
      ) f
    ),
    'triggers',
    (
      select coalesce(
        jsonb_agg(
          to_jsonb(t)
          order by t.schema_name, t.relation_name, t.trigger_name
        ),
        '[]'::jsonb
      )
      from (
        select
          n.nspname as schema_name,
          c.relname as relation_name,
          trigger_row.tgname as trigger_name,
          pg_get_triggerdef(trigger_row.oid, true) as definition
        from pg_trigger trigger_row
        join pg_class c on c.oid = trigger_row.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
        where not trigger_row.tgisinternal
          and n.nspname in (
            'public',
            'commerce_v2',
            'legacy_archive',
            'security_private'
          )
        order by n.nspname, c.relname, trigger_row.tgname
      ) t
    ),
    'views',
    (
      select coalesce(
        jsonb_agg(
          to_jsonb(v)
          order by v.schema_name, v.view_name
        ),
        '[]'::jsonb
      )
      from (
        select
          n.nspname as schema_name,
          c.relname as view_name,
          pg_get_userbyid(c.relowner) as owner,
          c.reloptions,
          pg_get_viewdef(c.oid, true) as definition
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname in (
          'public',
          'commerce_v2',
          'legacy_archive',
          'security_private'
        )
          and c.relkind = 'v'
        order by n.nspname, c.relname
      ) v
    ),
    'enums',
    (
      select coalesce(
        jsonb_agg(
          to_jsonb(e)
          order by e.schema_name, e.type_name, e.sort_order
        ),
        '[]'::jsonb
      )
      from (
        select
          n.nspname as schema_name,
          t.typname as type_name,
          enum_row.enumsortorder as sort_order,
          enum_row.enumlabel as label
        from pg_type t
        join pg_namespace n on n.oid = t.typnamespace
        join pg_enum enum_row on enum_row.enumtypid = t.oid
        where n.nspname in (
          'public',
          'commerce_v2',
          'legacy_archive',
          'security_private'
        )
        order by n.nspname, t.typname, enum_row.enumsortorder
      ) e
    ),
    'policies',
    (
      select coalesce(
        jsonb_agg(
          to_jsonb(p)
          order by p.schema_name, p.relation_name, p.policy_name
        ),
        '[]'::jsonb
      )
      from (
        select
          schemaname as schema_name,
          tablename as relation_name,
          policyname as policy_name,
          permissive,
          roles,
          cmd as command,
          qual as using_expression,
          with_check as check_expression
        from pg_policies
        where schemaname in (
          'public',
          'commerce_v2',
          'legacy_archive',
          'security_private'
        )
        order by schemaname, tablename, policyname
      ) p
    ),
    'table_grants',
    (
      select coalesce(
        jsonb_agg(
          to_jsonb(g)
          order by g.schema_name, g.relation_name, g.grantee, g.privilege
        ),
        '[]'::jsonb
      )
      from (
        select
          table_schema as schema_name,
          table_name as relation_name,
          grantor,
          grantee,
          privilege_type as privilege,
          is_grantable
        from information_schema.role_table_grants
        where table_schema in (
          'public',
          'commerce_v2',
          'legacy_archive',
          'security_private'
        )
        order by table_schema, table_name, grantee, privilege_type
      ) g
    ),
    'routine_grants',
    (
      select coalesce(
        jsonb_agg(
          to_jsonb(g)
          order by g.schema_name, g.routine_name, g.grantee, g.privilege
        ),
        '[]'::jsonb
      )
      from (
        select
          routine_schema as schema_name,
          routine_name,
          grantor,
          grantee,
          privilege_type as privilege,
          is_grantable
        from information_schema.role_routine_grants
        where routine_schema in (
          'public',
          'commerce_v2',
          'legacy_archive',
          'security_private'
        )
        order by routine_schema, routine_name, grantee, privilege_type
      ) g
    ),
    'default_acl',
    (
      select coalesce(
        jsonb_agg(
          to_jsonb(a)
          order by a.owner, a.schema_name, a.object_type
        ),
        '[]'::jsonb
      )
      from (
        select
          pg_get_userbyid(default_row.defaclrole) as owner,
          coalesce(n.nspname, '') as schema_name,
          default_row.defaclobjtype as object_type,
          default_row.defaclacl::text as acl
        from pg_default_acl default_row
        left join pg_namespace n on n.oid = default_row.defaclnamespace
        where n.nspname is null
           or n.nspname in (
             'public',
             'commerce_v2',
             'legacy_archive',
             'security_private'
           )
        order by owner, schema_name, object_type
      ) a
    ),
    'migration_history',
    (
      select coalesce(
        jsonb_agg(
          to_jsonb(m)
          order by m.version
        ),
        '[]'::jsonb
      )
      from (
        select
          version,
          name,
          coalesce(array_length(statements, 1), 0) as statement_count,
          md5(array_to_string(statements, E'\n')) as statements_md5
        from supabase_migrations.schema_migrations
        order by version
      ) m
    ),
    'storage_buckets',
    (
      select coalesce(
        jsonb_agg(
          to_jsonb(b)
          order by b.id
        ),
        '[]'::jsonb
      )
      from (
        select
          id,
          public,
          file_size_limit,
          allowed_mime_types
        from storage.buckets
        order by id
      ) b
    )
  )
) as catalog;

rollback;
