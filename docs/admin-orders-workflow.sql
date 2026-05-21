-- Admin fulfillment workflow fields used by /admin/orders.
-- Run this once against the Supabase database if these columns are not present.

alter table public.orders
  add column if not exists fulfillment_status text not null default 'review',
  add column if not exists admin_notes text,
  add column if not exists needs_review boolean not null default false,
  add column if not exists verified boolean not null default false,
  add column if not exists passive_verified boolean not null default false,
  add column if not exists doctor_confirmed boolean not null default false,
  add column if not exists blocked boolean not null default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_fulfillment_status_check'
  ) then
    alter table public.orders
      add constraint orders_fulfillment_status_check
      check (
        fulfillment_status in (
          'review',
          'ready_to_order',
          'ordered',
          'shipped',
          'completed',
          'hold',
          'cancelled'
        )
      );
  end if;
end $$;
