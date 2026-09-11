-- Manual/admin-reviewed recovery only. This migration does not enable or schedule
-- automatic recovery delivery, and it does not mutate order/payment state.
update public.order_operations_control
set recovery_enabled = false,
    recovery_changed_at = now(),
    recovery_changed_by = null
where id;

alter table public.recovery_touch_drafts
  add column if not exists ignored_at timestamptz,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid;

alter table public.recovery_touch_drafts
  drop constraint if exists recovery_touch_drafts_state_check;
alter table public.recovery_touch_drafts
  add constraint recovery_touch_drafts_state_check
  check (state in (
    'pending_founder_approval', 'sending', 'sent', 'suppressed',
    'needs_review', 'ignored'
  ));

create or replace function public.claim_manual_recovery_delivery(
  p_order_id uuid,
  p_delivery_id uuid,
  p_email text,
  p_token_hash text,
  p_activity_at timestamptz,
  p_expires_at timestamptz,
  p_admin_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_delivery_id uuid;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found
    or v_order.created_at < timestamptz '2026-09-05 00:00:00+00'
    or v_order.status::text <> 'draft'
    or coalesce(v_order.archived, false)
    or v_order.archived_at is not null
    or coalesce(v_order.fulfillment_status, 'review') <> 'review'
    or v_order.confirmation_email_sent_at is not null
    or lower(trim(coalesce(v_order.shipping_email, ''))) <> lower(trim(p_email))
    or lower(trim(p_email)) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then
    return jsonb_build_object('claimed', false, 'reason', 'ineligible');
  end if;

  if exists (
    select 1 from public.recovery_touch_drafts
    where order_id = p_order_id
      and state in ('sending', 'sent', 'ignored', 'needs_review')
  ) then
    return jsonb_build_object('claimed', false, 'reason', 'already_resolved');
  end if;

  select id into v_delivery_id
  from public.recovery_touch_drafts
  where order_id = p_order_id
    and state in ('pending_founder_approval', 'suppressed')
  order by created_at asc
  limit 1
  for update;

  if v_delivery_id is null then
    v_delivery_id := p_delivery_id;
    insert into public.recovery_touch_drafts (
      id, order_id, touch_hours, email, token_hash, activity_at, expires_at,
      state, first_attempt_at, last_attempt_at, reviewed_at, reviewed_by
    ) values (
      v_delivery_id, p_order_id, 1, lower(trim(p_email)), p_token_hash,
      p_activity_at, p_expires_at, 'sending', now(), now(), now(), p_admin_id
    );
  else
    update public.recovery_touch_drafts
    set email = lower(trim(p_email)), token_hash = p_token_hash,
        activity_at = p_activity_at, expires_at = p_expires_at,
        state = 'sending', first_attempt_at = coalesce(first_attempt_at, now()),
        last_attempt_at = now(), reviewed_at = now(), reviewed_by = p_admin_id,
        last_error = null
    where id = v_delivery_id;
  end if;

  update public.recovery_touch_drafts
  set state = 'suppressed',
      last_error = 'Superseded by the single admin-reviewed recovery action.'
  where order_id = p_order_id and id <> v_delivery_id
    and state in ('pending_founder_approval', 'suppressed');

  return jsonb_build_object(
    'claimed', true,
    'delivery_id', v_delivery_id,
    'reason', 'claimed'
  );
end;
$$;

create or replace function public.ignore_manual_recovery(
  p_order_id uuid,
  p_delivery_id uuid,
  p_email text,
  p_token_hash text,
  p_activity_at timestamptz,
  p_expires_at timestamptz,
  p_admin_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_delivery_id uuid;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found
    or v_order.created_at < timestamptz '2026-09-05 00:00:00+00'
    or v_order.status::text <> 'draft'
    or coalesce(v_order.archived, false)
    or v_order.archived_at is not null
    or coalesce(v_order.fulfillment_status, 'review') <> 'review'
    or v_order.confirmation_email_sent_at is not null
    or lower(trim(coalesce(v_order.shipping_email, ''))) <> lower(trim(p_email))
    or lower(trim(p_email)) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then
    return jsonb_build_object('claimed', false, 'reason', 'ineligible');
  end if;

  if exists (
    select 1 from public.recovery_touch_drafts
    where order_id = p_order_id
      and state in ('sending', 'sent', 'ignored')
  ) then
    return jsonb_build_object('claimed', false, 'reason', 'already_resolved');
  end if;

  select id into v_delivery_id
  from public.recovery_touch_drafts
  where order_id = p_order_id
    and state in ('pending_founder_approval', 'suppressed', 'needs_review')
  order by created_at asc
  limit 1
  for update;

  if v_delivery_id is null then
    v_delivery_id := p_delivery_id;
    insert into public.recovery_touch_drafts (
      id, order_id, touch_hours, email, token_hash, activity_at, expires_at,
      state, ignored_at, reviewed_at, reviewed_by
    ) values (
      v_delivery_id, p_order_id, 1, lower(trim(p_email)), p_token_hash,
      p_activity_at, p_expires_at, 'ignored', now(), now(), p_admin_id
    );
  else
    update public.recovery_touch_drafts
    set email = lower(trim(p_email)), token_hash = p_token_hash,
        activity_at = p_activity_at, expires_at = p_expires_at,
        state = 'ignored', ignored_at = now(), reviewed_at = now(),
        reviewed_by = p_admin_id, last_error = null
    where id = v_delivery_id;
  end if;

  update public.recovery_touch_drafts
  set state = 'suppressed',
      last_error = 'Superseded by the admin recovery dismissal.'
  where order_id = p_order_id and id <> v_delivery_id
    and state in ('pending_founder_approval', 'suppressed');

  return jsonb_build_object(
    'claimed', true,
    'delivery_id', v_delivery_id,
    'reason', 'ignored'
  );
end;
$$;

revoke all on function public.claim_manual_recovery_delivery(
  uuid, uuid, text, text, timestamptz, timestamptz, uuid
) from public, anon, authenticated;
grant execute on function public.claim_manual_recovery_delivery(
  uuid, uuid, text, text, timestamptz, timestamptz, uuid
) to service_role;

revoke all on function public.ignore_manual_recovery(
  uuid, uuid, text, text, timestamptz, timestamptz, uuid
) from public, anon, authenticated;
grant execute on function public.ignore_manual_recovery(
  uuid, uuid, text, text, timestamptz, timestamptz, uuid
) to service_role;

comment on function public.claim_manual_recovery_delivery(
  uuid, uuid, text, text, timestamptz, timestamptz, uuid
) is 'Atomically claims one admin-reviewed recovery send. Does not enable automatic recovery.';
