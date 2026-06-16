-- Temporary high-intent abandonment feedback experiment.
-- Apply before enabling ABANDONMENT_FEEDBACK_EXPERIMENT=true.

alter table public.orders
  add column if not exists feedback_credit_cents integer not null default 0,
  add column if not exists feedback_credit_applied_at timestamptz,
  add column if not exists feedback_reason text,
  add column if not exists feedback_notes text,
  add column if not exists feedback_survey_shown_at timestamptz,
  add column if not exists feedback_survey_completed_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_feedback_credit_cents_check'
  ) then
    alter table public.orders
      add constraint orders_feedback_credit_cents_check
      check (feedback_credit_cents in (0, 1000));
  end if;
end $$;

create index if not exists orders_feedback_survey_completed_at_idx
  on public.orders (feedback_survey_completed_at)
  where feedback_survey_completed_at is not null;

create index if not exists orders_feedback_survey_shown_at_idx
  on public.orders (feedback_survey_shown_at)
  where feedback_survey_shown_at is not null;

create index if not exists orders_feedback_reason_idx
  on public.orders (feedback_reason)
  where feedback_reason is not null;

-- Survey responses by reason.
select
  feedback_reason,
  count(*) as response_count,
  count(*) filter (where feedback_credit_cents = 1000) as credits_applied
from public.orders
where feedback_survey_completed_at is not null
group by feedback_reason
order by response_count desc, feedback_reason asc;

-- Overall credits and recovered revenue.
select
  count(*) filter (where feedback_credit_cents = 1000) as credits_applied,
  count(*) filter (
    where feedback_survey_completed_at is not null
      and status in ('authorized', 'captured', 'completed')
  ) as orders_recovered_after_survey,
  coalesce(sum(
    greatest(total_amount_cents - feedback_credit_cents, 0)
  ) filter (
    where feedback_survey_completed_at is not null
      and status in ('authorized', 'captured', 'completed')
  ), 0) as revenue_recovered_cents
from public.orders
where feedback_survey_completed_at is not null;

-- Conversion rate by abandonment reason.
select
  feedback_reason,
  count(*) as responses,
  count(*) filter (where status in ('authorized', 'captured', 'completed'))
    as recovered_orders,
  round(
    100.0
    * count(*) filter (where status in ('authorized', 'captured', 'completed'))
    / nullif(count(*), 0),
    2
  ) as conversion_rate_percent,
  coalesce(sum(
    greatest(total_amount_cents - feedback_credit_cents, 0)
  ) filter (where status in ('authorized', 'captured', 'completed')), 0)
    as revenue_recovered_cents
from public.orders
where feedback_survey_completed_at is not null
group by feedback_reason
order by responses desc, feedback_reason asc;
