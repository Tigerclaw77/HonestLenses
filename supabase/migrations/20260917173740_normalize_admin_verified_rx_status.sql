begin;

create or replace function public.apply_admin_prescription_acceptance(
  p_order_id uuid,
  p_actor text,
  p_confirmed boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_updated public.orders%rowtype;
  v_completed_at timestamptz := now();
begin
  if p_confirmed is distinct from true then
    raise exception 'Explicit operator confirmation is required';
  end if;

  if nullif(trim(coalesce(p_actor, '')), '') is null then
    raise exception 'An authenticated operator is required';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if lower(coalesce(v_order.verification_status, '')) in (
    'verified',
    'auto_verified',
    'ocr_verified',
    'upload_verified',
    'not_required',
    'passive_verified',
    'doctor_confirmed'
  ) then
    return jsonb_build_object(
      'order', to_jsonb(v_order),
      'already_done', true,
      'event_logged', true
    );
  end if;

  if not (
    v_order.rx_upload_path is not null
    or v_order.rx is not null
    or nullif(trim(coalesce(v_order.prescriber_name, '')), '') is not null
    or nullif(trim(coalesce(v_order.prescriber_email, '')), '') is not null
    or nullif(trim(coalesce(v_order.prescriber_phone, '')), '') is not null
    or lower(coalesce(v_order.verification_status, '')) in (
      'requires_review',
      'review',
      'manual_review',
      'founder_review',
      'information_needed',
      'verification_information_needed',
      'rejected',
      'blocked'
    )
    or lower(coalesce(v_order.rx_status, '')) = 'ocr_failed'
  ) then
    raise exception 'No reviewable prescription decision is available for operator acceptance';
  end if;

  update public.orders
  set verification_method = 'admin',
      verification_passed = true,
      verification_status = 'verified',
      verification_completed_at = v_completed_at,
      rx_status = 'manual_verified',
      updated_at = v_completed_at
  where id = p_order_id
  returning * into v_updated;

  insert into public.order_events (
    order_id,
    event_type,
    actor,
    message,
    before,
    after,
    created_at
  ) values (
    p_order_id,
    'admin_prescription_accepted',
    p_actor,
    'Authenticated operator explicitly accepted the prescription after review.',
    jsonb_build_object(
      'verification_status', v_order.verification_status,
      'verification_passed', v_order.verification_passed,
      'verification_reason', v_order.rx_status,
      'rx_source', v_order.rx_source
    ),
    jsonb_build_object(
      'verification_status', 'verified',
      'verification_passed', true,
      'verification_method', 'admin',
      'verification_completed_at', v_completed_at,
      'rx_status', 'manual_verified',
      'operator_confirmed', true
    ),
    v_completed_at
  );

  return jsonb_build_object(
    'order', to_jsonb(v_updated),
    'already_done', false,
    'event_logged', true
  );
end;
$$;

revoke all on function public.apply_admin_prescription_acceptance(uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.apply_admin_prescription_acceptance(uuid, text, boolean)
  to service_role;

commit;
