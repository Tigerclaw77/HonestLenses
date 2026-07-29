begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- ACCESS EXCLUSIVE prevents a writer from inserting after the exact checks
-- and before the schemas are dropped.
lock table
  commerce_v2.orders,
  commerce_v2.order_items,
  commerce_v2.payments,
  commerce_v2.payment_events,
  commerce_v2.payment_event_inbox,
  commerce_v2.payment_operations,
  commerce_v2.prescription_verifications,
  commerce_v2.prescription_verification_events,
  commerce_v2.fulfillments,
  commerce_v2.fulfillment_events,
  commerce_v2.order_adjustments,
  commerce_v2.order_events,
  commerce_v2.reconciliation_runs,
  commerce_v2.reconciliation_findings,
  commerce_v2.legacy_imports
in access exclusive mode;

do $$
declare
  populated_tables text[];
begin
  populated_tables := array_remove(
    array[
      case when exists (select 1 from commerce_v2.orders) then 'commerce_v2.orders' end,
      case when exists (select 1 from commerce_v2.order_items) then 'commerce_v2.order_items' end,
      case when exists (select 1 from commerce_v2.payments) then 'commerce_v2.payments' end,
      case when exists (select 1 from commerce_v2.payment_events) then 'commerce_v2.payment_events' end,
      case when exists (select 1 from commerce_v2.payment_event_inbox) then 'commerce_v2.payment_event_inbox' end,
      case when exists (select 1 from commerce_v2.payment_operations) then 'commerce_v2.payment_operations' end,
      case when exists (select 1 from commerce_v2.prescription_verifications) then 'commerce_v2.prescription_verifications' end,
      case when exists (select 1 from commerce_v2.prescription_verification_events) then 'commerce_v2.prescription_verification_events' end,
      case when exists (select 1 from commerce_v2.fulfillments) then 'commerce_v2.fulfillments' end,
      case when exists (select 1 from commerce_v2.fulfillment_events) then 'commerce_v2.fulfillment_events' end,
      case when exists (select 1 from commerce_v2.order_adjustments) then 'commerce_v2.order_adjustments' end,
      case when exists (select 1 from commerce_v2.order_events) then 'commerce_v2.order_events' end,
      case when exists (select 1 from commerce_v2.reconciliation_runs) then 'commerce_v2.reconciliation_runs' end,
      case when exists (select 1 from commerce_v2.reconciliation_findings) then 'commerce_v2.reconciliation_findings' end,
      case when exists (select 1 from commerce_v2.legacy_imports) then 'commerce_v2.legacy_imports' end
    ],
    null
  );

  if cardinality(populated_tables) > 0 then
    raise exception 'Commerce v2 reverse refused; populated tables: %',
      array_to_string(populated_tables, ', ')
      using errcode = '55000';
  end if;
end
$$;

drop schema commerce_v2 cascade;
drop schema legacy_archive cascade;

commit;
