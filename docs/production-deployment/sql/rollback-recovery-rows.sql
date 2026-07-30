begin transaction isolation level repeatable read read only;
set local statement_timeout = '60s';
set local lock_timeout = '5s';

select jsonb_pretty(
  jsonb_build_object(
    'captured_at_utc', clock_timestamp(),
    'transaction_read_only', current_setting('transaction_read_only'),
    'classification', 'CONFIDENTIAL_ROLLBACK_DATA',
    'shared_guest_user_id', '11111111-1111-4111-8111-111111111111',
    'orders',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'order_id', id,
            'user_id', user_id
          )
          order by id
        )
        from public.orders
        where user_id = '11111111-1111-4111-8111-111111111111'::uuid
      ),
      '[]'::jsonb
    )
  )
) as rollback_recovery_rows;

rollback;
