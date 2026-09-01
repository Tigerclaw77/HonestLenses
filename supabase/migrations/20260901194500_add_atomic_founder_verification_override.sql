begin;

create or replace function public.apply_founder_verification_override(
  p_order_id uuid,
  p_actor text,
  p_reason text,
  p_payment_intent_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_updated public.orders%rowtype;
  v_reason text := trim(coalesce(p_reason, ''));
begin
  if length(v_reason) = 0 or length(v_reason) > 500 then
    raise exception 'A founder override reason between 1 and 500 characters is required';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if coalesce(v_order.fulfillment_status, 'review') <> 'review'
     or v_order.status not in ('authorized', 'captured')
     or v_order.verification_status in ('verified', 'auto_verified') then
    raise exception 'Order is not eligible for founder override';
  end if;

  if v_order.payment_intent_id is distinct from p_payment_intent_id then
    raise exception 'Payment intent changed before founder override completed';
  end if;

  update public.orders
  set verification_method = 'admin',
      verification_passed = true,
      verification_status = 'verified',
      verification_completed_at = now(),
      status = 'captured',
      fulfillment_status = 'ready_to_order',
      admin_notes = concat_ws(
        E'\n',
        nullif(admin_notes, ''),
        format('Founder Override by %s: %s', p_actor, v_reason)
      ),
      updated_at = now()
  where id = p_order_id
  returning * into v_updated;

  insert into public.order_events (
    order_id,
    event_type,
    actor,
    message,
    before,
    after
  ) values (
    p_order_id,
    'admin_verification_override',
    p_actor,
    v_reason,
    jsonb_build_object(
      'verification_status', v_order.verification_status,
      'fulfillment_status', v_order.fulfillment_status,
      'status', v_order.status
    ),
    jsonb_build_object(
      'verification_status', 'verified',
      'verification_method', 'admin',
      'verification_passed', true,
      'verification_completed_at', v_updated.verification_completed_at,
      'fulfillment_status', 'ready_to_order',
      'status', 'captured'
    )
  );

  return to_jsonb(v_updated);
end;
$$;

revoke all on function public.apply_founder_verification_override(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.apply_founder_verification_override(uuid, text, text, text)
  to service_role;

commit;
