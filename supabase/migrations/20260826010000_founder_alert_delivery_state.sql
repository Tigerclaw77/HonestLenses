alter table public.order_founder_alerts
  add column if not exists sent_at timestamptz,
  add column if not exists last_attempted_at timestamptz,
  add column if not exists last_error text;

comment on column public.order_founder_alerts.sent_at is
  'Timestamp of the most recent successful founder notification send.';
comment on column public.order_founder_alerts.last_attempted_at is
  'Timestamp of the most recent founder notification send attempt.';
comment on column public.order_founder_alerts.last_error is
  'Most recent non-sensitive provider error, if an alert attempt failed.';
