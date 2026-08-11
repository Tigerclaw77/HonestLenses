begin;

alter table public.orders
  add column if not exists admin_notes text;

commit;
