-- Disposable hosted application-integration fixture only.
--
-- This is not a production migration. The repository does not contain the
-- complete historical legacy schema, so this file adds the known columns used
-- by the current customer/admin authorization routes. It allows the local
-- Next.js candidate to run against the disposable hosted project without
-- claiming that this synthetic baseline is an exact production schema dump.

alter table public.orders
  add column if not exists total_amount_cents integer default 1099,
  add column if not exists revised_total_amount_cents integer,
  add column if not exists capture_amount_cents integer,
  add column if not exists verification_status text default 'pending',
  add column if not exists price_reason text,
  add column if not exists rx_ocr_raw jsonb,
  add column if not exists manufacturer text default 'Validation',
  add column if not exists sku text default 'OASYS_MAX_1D_90',
  add column if not exists shipping_method text default 'standard',
  add column if not exists shipping_cents integer default 0,
  add column if not exists payment_intent_id text,
  add column if not exists feedback_credit_cents integer default 0,
  add column if not exists feedback_credit_applied_at timestamptz,
  add column if not exists feedback_survey_completed_at timestamptz,
  add column if not exists rx_upload_path text,
  add column if not exists rx_source text default 'manual',
  add column if not exists patient_name text,
  add column if not exists patient_full_name text default 'Security Gate',
  add column if not exists patient_first_name text default 'Security',
  add column if not exists patient_middle_name text,
  add column if not exists patient_last_name text default 'Gate',
  add column if not exists patient_dob date default '1990-01-01',
  add column if not exists prescriber_name text,
  add column if not exists prescriber_email text,
  add column if not exists prescriber_phone text,
  add column if not exists shipping_first_name text default 'Security',
  add column if not exists shipping_last_name text default 'Gate',
  add column if not exists shipping_email text default 'security@example.invalid',
  add column if not exists shipping_phone text default '3125550100',
  add column if not exists shipping_address1 text default '1 Validation Way',
  add column if not exists shipping_address2 text,
  add column if not exists shipping_city text default 'Testville',
  add column if not exists shipping_state text default 'IL',
  add column if not exists shipping_zip text default '60601',
  add column if not exists right_box_count integer default 1,
  add column if not exists left_box_count integer default 1,
  add column if not exists total_box_count integer default 2,
  add column if not exists box_count integer default 2,
  add column if not exists adjusted_right_box_count integer,
  add column if not exists adjusted_left_box_count integer,
  add column if not exists adjusted_total_box_count integer,
  add column if not exists currency text default 'USD',
  add column if not exists fulfillment_status text,
  add column if not exists passive_deadline_at timestamptz,
  add column if not exists rx_lens_brand text,
  add column if not exists archived boolean default false,
  add column if not exists archived_at timestamptz,
  add column if not exists admin_notes text,
  add column if not exists payment_status text,
  add column if not exists authorization_expires_at timestamptz,
  add column if not exists allow_price_increase boolean default false,
  add column if not exists allow_price_decrease boolean default true,
  add column if not exists verification_passed boolean default false,
  add column if not exists verification_completed_at timestamptz,
  add column if not exists verified_lens text,
  add column if not exists capture_adjustment_reason text,
  add column if not exists capture_adjusted_by text,
  add column if not exists capture_adjusted_at timestamptz,
  add column if not exists rx_status text,
  add column if not exists email_delivery_status text,
  add column if not exists email_last_event text,
  add column if not exists email_last_event_at timestamptz,
  add column if not exists email_failure_reason text,
  add column if not exists email_delivery_requires_attention boolean default false,
  add column if not exists confirmation_email_sent_at timestamptz,
  add column if not exists confirmation_email_delivered_at timestamptz;

update public.orders
set
  status = 'authorized',
  verification_status = 'pending',
  payment_intent_id = null,
  total_amount_cents = 1099,
  capture_amount_cents = 1099,
  currency = 'USD',
  updated_at = now()
where id in (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
);
