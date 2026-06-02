-- Capture amount adjustment fields for admin order payment operations.
-- Run this once against Supabase before deploying the admin adjustment UI/API.

alter table public.orders
  add column if not exists capture_amount_cents bigint,
  add column if not exists capture_adjustment_reason text,
  add column if not exists capture_adjusted_by text,
  add column if not exists capture_adjusted_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_capture_amount_cents_check'
  ) then
    alter table public.orders
      add constraint orders_capture_amount_cents_check
      check (
        capture_amount_cents is null
        or (
          total_amount_cents is not null
          and capture_amount_cents > 0
          and capture_amount_cents <= total_amount_cents
        )
      );
  end if;
end $$;
