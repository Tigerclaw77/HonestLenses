-- Reconciles a legacy order into the founder archive without changing payment,
-- prescription, verification, or supplier facts.  The archive write and audit
-- event commit atomically so a failed audit never leaves an unaccounted state.
create or replace function public.founder_complete_archive_order(
  p_order_id uuid,
  p_actor text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_now timestamptz := now();
begin
  select jsonb_build_object(
    'status', o.status,
    'fulfillment_status', o.fulfillment_status,
    'payment_status', o.payment_status,
    'verification_status', o.verification_status,
    'archived', o.archived,
    'archived_at', o.archived_at
  )
  into v_before
  from public.orders o
  where o.id = p_order_id
  for update;

  if v_before is null then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  update public.orders o
  set
    archived = true,
    archived_at = coalesce(o.archived_at, v_now),
    updated_at = v_now
  where o.id = p_order_id
  returning jsonb_build_object(
    'status', o.status,
    'fulfillment_status', o.fulfillment_status,
    'payment_status', o.payment_status,
    'verification_status', o.verification_status,
    'archived', o.archived,
    'archived_at', o.archived_at
  ) into v_after;

  insert into public.order_events (
    order_id,
    event_type,
    actor,
    message,
    before,
    after
  ) values (
    p_order_id,
    'founder_order_completed_archived',
    nullif(trim(p_actor), ''),
    'Founder override: marked completed / archived without changing payment, prescription, verification, or supplier state.',
    v_before,
    v_after
  );

  return v_after;
end;
$$;

revoke all on function public.founder_complete_archive_order(uuid, text)
  from public, anon, authenticated;
grant execute on function public.founder_complete_archive_order(uuid, text)
  to service_role;
