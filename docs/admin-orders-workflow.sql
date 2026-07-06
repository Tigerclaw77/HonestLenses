-- Admin fulfillment workflow fields used by /admin/orders.
-- Run this once against the Supabase database if these columns are not present.

alter table public.orders
  add column if not exists fulfillment_status text not null default 'review',
  add column if not exists admin_notes text,
  add column if not exists needs_review boolean not null default false,
  add column if not exists verified boolean not null default false,
  add column if not exists passive_verified boolean not null default false,
  add column if not exists doctor_confirmed boolean not null default false,
  add column if not exists blocked boolean not null default false,
  add column if not exists archived_at timestamptz;

alter table public.orders
  drop constraint if exists orders_fulfillment_status_check;

alter table public.orders
  add constraint orders_fulfillment_status_check
  check (
    fulfillment_status in (
      'review',
      'ready_to_order',
      'ordered',
      'backordered',
      'ready_to_ship',
      'shipped',
      'completed',
      'hold',
      'cancelled'
    )
  );
