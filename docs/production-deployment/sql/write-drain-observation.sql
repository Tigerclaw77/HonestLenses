begin read only;

select jsonb_build_object(
  'captured_at', clock_timestamp(),
  'transaction_read_only', current_setting('transaction_read_only'),
  'active_writer_transactions',
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'pid', pid,
          'user', usename,
          'application_name', application_name,
          'state', state,
          'xact_start', xact_start,
          'query_start', query_start
        )
        order by pid
      )
      from pg_stat_activity
      where datname = current_database()
        and pid <> pg_backend_pid()
        and backend_xid is not null
    ),
    '[]'::jsonb
  ),
  'prepared_transactions',
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'gid', gid,
          'prepared', prepared,
          'owner', owner,
          'database', database
        )
        order by gid
      )
      from pg_prepared_xacts
      where database = current_database()
    ),
    '[]'::jsonb
  ),
  'write_counters',
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'schema', schemaname,
          'table', relname,
          'inserted', n_tup_ins,
          'updated', n_tup_upd,
          'deleted', n_tup_del
        )
        order by schemaname, relname
      )
      from pg_stat_all_tables
      where schemaname in (
        'public',
        'security_private',
        'commerce_v2',
        'legacy_archive'
      )
    ),
    '[]'::jsonb
  )
);

rollback;
