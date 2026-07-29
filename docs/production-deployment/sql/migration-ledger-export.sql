begin read only;

select jsonb_build_object(
  'transaction_read_only',
  current_setting('transaction_read_only'),
  'migrations',
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'version', version,
          'name', name,
          'statements', statements
        )
        order by version
      )
      from supabase_migrations.schema_migrations
    ),
    '[]'::jsonb
  )
);

rollback;
