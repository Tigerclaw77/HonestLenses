-- Additive, inert recall coordination. Sending remains disabled by the existing
-- order_operations_control.reorder_reminders_enabled gate.
alter table public.reorder_reminder_preferences
  add column next_expiration_at timestamptz,
  add column expiration_sent_at timestamptz;

alter table public.order_operations_control
  add column reorder_recall_live_from timestamptz,
  add column reorder_recall_compliance_approved_at timestamptz;

create index reorder_expiration_due_idx
  on public.reorder_reminder_preferences (next_expiration_at)
  where stopped_at is null and next_expiration_at is not null;

-- One durable claim per recipient protects a rolling 30-day window even when
-- two scheduler invocations process different orders at the same time.
create table public.reorder_recall_recipient_claims (
  email_hash text primary key check (email_hash ~ '^[0-9a-f]{64}$'),
  claim_key text not null unique,
  order_id uuid not null references public.orders(id),
  claimed_at timestamptz not null default now(),
  status text not null default 'claimed' check (status in ('claimed','accepted','unknown'))
);
alter table public.reorder_recall_recipient_claims enable row level security;
revoke all on public.reorder_recall_recipient_claims from public, anon, authenticated;
grant select, insert, update, delete on public.reorder_recall_recipient_claims to service_role;

create function public.claim_reorder_recall_recipient(p_email_hash text, p_claim_key text, p_order_id uuid)
returns boolean language plpgsql security invoker set search_path = public as $$
declare claimed boolean;
begin
  insert into public.reorder_recall_recipient_claims(email_hash, claim_key, order_id)
  values (p_email_hash, p_claim_key, p_order_id)
  on conflict (email_hash) do update
    set claim_key = excluded.claim_key,
        order_id = excluded.order_id,
        claimed_at = now(),
        status = 'claimed'
    where public.reorder_recall_recipient_claims.status = 'accepted'
      and public.reorder_recall_recipient_claims.claimed_at <= now() - interval '30 days'
  returning true into claimed;
  return coalesce(claimed, false);
end;
$$;
revoke all on function public.claim_reorder_recall_recipient(text,text,uuid) from public, anon, authenticated;
grant execute on function public.claim_reorder_recall_recipient(text,text,uuid) to service_role;

-- Match recipient addresses without disclosing them to the browser. The caller
-- separately checks suppressions, bounces, and prescription evidence.
create function public.reorder_recall_activity(p_order_id uuid)
returns table(recent_purchase boolean, pending_reorder boolean, newer_order boolean, bounced boolean)
language sql stable security invoker set search_path = public as $$
  with source as (
    select lower(btrim(shipping_email)) as email, created_at
    from public.orders where id = p_order_id
  )
  select
    exists(select 1 from public.orders o, source s
      where o.id <> p_order_id and lower(btrim(o.shipping_email)) = s.email
        and o.status in ('captured','fulfilled')
        and o.created_at > s.created_at
        and o.created_at >= now() - interval '30 days'),
    exists(select 1 from public.orders o, source s
      where o.id <> p_order_id and lower(btrim(o.shipping_email)) = s.email
        and o.status in ('draft','pending','verified','authorized')
        and o.updated_at >= now() - interval '30 days'),
    exists(select 1 from public.orders o, source s
      where o.id <> p_order_id and lower(btrim(o.shipping_email)) = s.email
        and o.status in ('captured','fulfilled') and o.created_at > s.created_at),
    exists(select 1 from public.orders o, source s
      where lower(btrim(o.shipping_email)) = s.email
        and o.email_delivery_status in ('bounced','complained','suppressed'));
$$;
revoke all on function public.reorder_recall_activity(uuid) from public, anon, authenticated;
grant execute on function public.reorder_recall_activity(uuid) to service_role;

create function public.reorder_recall_metrics()
returns table(scheduled bigint, sent bigint, delivery_failures bigint, conversions bigint)
language sql stable security invoker set search_path = public as $$
  select
    (select count(*) from public.reorder_reminder_preferences p
      where p.stopped_at is null and
        (p.next_reminder_at is not null or p.next_expiration_at is not null)),
    (select count(*) from public.reorder_reminder_attempts a where a.status = 'accepted'),
    (select count(*) from public.reorder_reminder_attempts a
      where a.status in ('rejected','unknown')) +
    (select count(*) from public.order_email_deliveries d
      where d.email_type = 'reorder_reminder' and
        d.delivery_status in ('bounced','failed','suppressed')),
    (select count(distinct d.draft_order_id)
      from public.reorder_drafts d
      join public.orders o on o.id = d.draft_order_id
      join public.reorder_reminder_preferences p on p.order_id = d.source_order_id
      where o.status in ('captured','fulfilled') and p.last_sent_at is not null
        and o.created_at >= p.last_sent_at);
$$;
revoke all on function public.reorder_recall_metrics() from public, anon, authenticated;
grant execute on function public.reorder_recall_metrics() to service_role;
