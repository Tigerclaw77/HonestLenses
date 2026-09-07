-- Reversible rollback of synthetic age exceptions; customer/order tables untouched.
create or replace function public.suppress_individual_stuck_email_claim() returns trigger
language plpgsql set search_path=public as $$
begin
  new.notification_claimed_at := coalesce(new.notification_claimed_at, now());
  if new.reason like '%order has remained%' then new.active := false; end if;
  return new;
end;
$$;
update public.order_stuck_alerts set active=false
where active and reason like '%order has remained%';
