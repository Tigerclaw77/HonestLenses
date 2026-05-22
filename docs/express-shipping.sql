-- Express shipping MVP field used by cart, checkout, and admin orders.
-- Run this once against Supabase before deploying code that persists shipping_method.

alter table public.orders
  add column if not exists shipping_method text not null default 'standard';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_shipping_method_check'
  ) then
    alter table public.orders
      add constraint orders_shipping_method_check
      check (shipping_method in ('standard', 'express'));
  end if;
end $$;
