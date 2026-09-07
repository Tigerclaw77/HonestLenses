create function public.suppress_individual_stuck_email_claim() returns trigger
language plpgsql set search_path=public as $$
begin
  new.notification_claimed_at := coalesce(new.notification_claimed_at, now());
  return new;
end;
$$;
revoke all on function public.suppress_individual_stuck_email_claim() from public,anon,authenticated;
create trigger suppress_individual_stuck_email_claim
before insert or update on public.order_stuck_alerts
for each row execute function public.suppress_individual_stuck_email_claim();
update public.order_stuck_alerts set notification_claimed_at=coalesce(notification_claimed_at,now());
