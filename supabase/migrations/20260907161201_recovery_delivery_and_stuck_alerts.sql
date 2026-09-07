create table public.order_operations_control (
  id boolean primary key default true check(id),
  recovery_enabled boolean not null default false,
  postal_address text,
  recovery_changed_at timestamptz, recovery_changed_by uuid,
  lease_id uuid, lease_until timestamptz,
  last_started_at timestamptz, last_succeeded_at timestamptz, last_error text,
  check (not recovery_enabled or (postal_address is not null and length(trim(postal_address)) >= 10))
);
insert into public.order_operations_control(id) values(true);
create table public.commercial_email_suppressions (
  email_hash text primary key check(email_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  reason text not null default 'recipient_opt_out'
);
alter table public.recovery_touch_drafts drop constraint recovery_touch_drafts_state_check;
alter table public.recovery_touch_drafts add constraint recovery_touch_drafts_state_check
  check(state in ('pending_founder_approval','sending','sent','suppressed','needs_review'));
alter table public.recovery_touch_drafts
  add column customer_name text,
  add column postal_address text,
  add column first_attempt_at timestamptz,
  add column last_attempt_at timestamptz,
  add column sent_at timestamptz,
  add column provider_id text,
  add column last_error text;
grant update on public.recovery_touch_drafts to service_role;
create table public.order_stuck_alerts (
  order_id uuid primary key references public.orders(id) on delete cascade,
  state_key text not null,
  state_since timestamptz not null,
  reason text,
  active boolean not null default false,
  acknowledged_until timestamptz,
  acknowledged_by uuid,
  notification_claimed_at timestamptz,
  notified_at timestamptz,
  notification_error text,
  last_checked_at timestamptz not null default now()
);
do $$ declare t text; begin
  foreach t in array array['order_operations_control','commercial_email_suppressions','order_stuck_alerts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public,anon,authenticated,service_role',t);
    execute format('grant select,insert,update on table public.%I to service_role',t);
  end loop;
end $$;

create function public.try_order_operations_run(p_lease uuid) returns boolean
language sql security invoker set search_path=public as $$
  with claimed as (
    update public.order_operations_control set lease_id=p_lease,
      lease_until=now()+interval '10 minutes',last_started_at=now()
    where id and (lease_until is null or lease_until<now()) returning id
  ) select exists(select 1 from claimed);
$$;
revoke all on function public.try_order_operations_run(uuid) from public,anon,authenticated;
grant execute on function public.try_order_operations_run(uuid) to service_role;

-- Final local-state fence and kill switch are checked atomically.
create function public.claim_recovery_delivery(p_id uuid) returns boolean
language sql security invoker set search_path=public as $$
  with claimed as (
    update public.recovery_touch_drafts d set state='sending',
      first_attempt_at=coalesce(first_attempt_at,now()),last_attempt_at=now()
    from public.orders o, public.order_operations_control c
    where d.id=p_id and o.id=d.order_id and c.id and c.recovery_enabled
      and o.status::text='draft' and not coalesce(o.archived,false) and o.archived_at is null
      and coalesce(o.fulfillment_status,'review')='review' and o.confirmation_email_sent_at is null
      and lower(trim(o.shipping_email))=d.email
      and d.expires_at>now()
      and (d.state='pending_founder_approval' or
        (d.state='sending' and d.first_attempt_at>now()-interval '23 hours' and d.last_attempt_at<now()-interval '5 minutes'))
    returning d.id
  ) select exists(select 1 from claimed);
$$;
revoke all on function public.claim_recovery_delivery(uuid) from public,anon,authenticated;
grant execute on function public.claim_recovery_delivery(uuid) to service_role;
