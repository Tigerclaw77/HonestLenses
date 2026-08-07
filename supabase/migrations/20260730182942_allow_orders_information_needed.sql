begin;

set local lock_timeout = '5s';

alter table public.orders
  drop constraint orders_verification_status_check,
  add constraint orders_verification_status_check
    check (
      verification_status = any (
        array[
          'pending'::text,
          'verified'::text,
          'altered'::text,
          'rejected'::text,
          'auto_verified'::text,
          'flagged'::text,
          'requires_review'::text,
          'information_needed'::text
        ]
      )
    );

commit;
