begin transaction isolation level repeatable read read only;
set local statement_timeout = '60s';
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
    'roles',
    (
      select coalesce(jsonb_agg(to_jsonb(r) order by r.name), '[]'::jsonb)
      from (
        select
          rolname as name,
          rolsuper as superuser,
          rolinherit as inherit,
          rolcreaterole as create_role,
          rolcreatedb as create_database,
          rolcanlogin as can_login,
          rolreplication as replication,
          rolconnlimit as connection_limit,
          rolvaliduntil as valid_until,
          rolbypassrls as bypass_rls,
          rolconfig as configuration
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
          grantor_role.rolname as grantor_name,
          membership.admin_option,
          membership.inherit_option,
          membership.set_option
        from pg_auth_members membership
        join pg_roles member_role on member_role.oid = membership.member
        join pg_roles granted_role on granted_role.oid = membership.roleid
        join pg_roles grantor_role on grantor_role.oid = membership.grantor
        order by member_role.rolname, granted_role.rolname
      ) m
    )
  )
) as roles_catalog;

rollback;
