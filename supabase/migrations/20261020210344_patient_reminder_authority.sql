-- Separate a purchaser's reorder request from authority over a patient's Rx alerts.
-- Existing rows remain intact; absence of this version does not prove authority.
alter table public.customer_reminder_choices
  add column patient_authority_version text;

alter table public.customer_reminder_choices
  drop constraint customer_reminder_choices_categories_check;
alter table public.customer_reminder_choices
  add constraint customer_reminder_choices_categories_check check (
    categories = array['replenishment']::text[] or
    categories = array['replenishment', 'prescription_expiration']::text[]
  );
