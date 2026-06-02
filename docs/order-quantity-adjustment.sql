-- Order quantity adjustment fields for admin-only operational corrections.
-- These fields preserve the originally submitted order quantities:
--   right_box_count
--   left_box_count
--   total_box_count
--   box_count

alter table public.orders
  add column if not exists adjusted_right_box_count integer null,
  add column if not exists adjusted_left_box_count integer null,
  add column if not exists adjusted_total_box_count integer null,
  add column if not exists order_quantity_adjustment_reason text null,
  add column if not exists order_quantity_adjusted_by text null,
  add column if not exists order_quantity_adjusted_at timestamptz null;

alter table public.orders
  drop constraint if exists orders_adjusted_order_quantity_check;

alter table public.orders
  add constraint orders_adjusted_order_quantity_check
  check (
    (
      adjusted_right_box_count is null
      and adjusted_left_box_count is null
      and adjusted_total_box_count is null
    )
    or
    (
      adjusted_right_box_count is not null
      and adjusted_left_box_count is not null
      and adjusted_total_box_count is not null
      and adjusted_right_box_count >= 0
      and adjusted_left_box_count >= 0
      and adjusted_total_box_count = adjusted_right_box_count + adjusted_left_box_count
      and adjusted_total_box_count > 0
    )
  );
