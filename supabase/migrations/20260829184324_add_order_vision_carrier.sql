set local lock_timeout = '5s';

alter table public.orders
  add column if not exists vision_insurance_carrier text;

alter table public.orders
  drop constraint if exists orders_vision_insurance_carrier_check;

alter table public.orders
  add constraint orders_vision_insurance_carrier_check
  check (
    vision_insurance_carrier is null
    or vision_insurance_carrier = any (
      array[
        'vsp'::text,
        'eyemed'::text,
        'davis_vision'::text,
        'superior_vision'::text,
        'uhc_spectera'::text,
        'aetna_vision'::text,
        'cigna_vision'::text,
        'metlife_vision'::text,
        'other'::text
      ]
    )
  );
