alter table public.resend_webhook_events
  add column if not exists referenced_order_id uuid,
  add column if not exists processing_status text;

update public.resend_webhook_events
set
  referenced_order_id = coalesce(referenced_order_id, order_id),
  processing_status = coalesce(
    processing_status,
    case when order_id is null then 'unmatched' else 'matched' end
  )
where referenced_order_id is null
   or processing_status is null;

alter table public.resend_webhook_events
  alter column processing_status set default 'unmatched',
  alter column processing_status set not null;

alter table public.resend_webhook_events
  drop constraint if exists resend_webhook_events_processing_status_check;

alter table public.resend_webhook_events
  add constraint resend_webhook_events_processing_status_check
  check (processing_status in ('matched', 'unmatched'));

create or replace function public.apply_resend_delivery_event(
  p_svix_id text,
  p_event_type text,
  p_email_id text,
  p_event_at timestamptz,
  p_order_id uuid,
  p_email_type text,
  p_recipient text,
  p_delivery_status text,
  p_failure_reason text,
  p_requires_attention boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_inserted_count integer := 0;
  v_candidate_order_id uuid;
  v_order_id uuid;
  v_email_type text := p_email_type;
  v_recipient text := p_recipient;
  v_linked_order_id uuid;
  v_linked_email_type text;
  v_linked_recipient text;
  v_existing_status text;
  v_existing_order_id uuid;
begin
  select
    order_id,
    email_type,
    recipient
  into v_linked_order_id, v_linked_email_type, v_linked_recipient
  from public.order_email_deliveries
  where resend_email_id = p_email_id;

  v_candidate_order_id := coalesce(v_linked_order_id, p_order_id);
  v_email_type := coalesce(v_linked_email_type, v_email_type);
  v_recipient := coalesce(v_linked_recipient, v_recipient);

  if v_candidate_order_id is not null and exists (
    select 1 from public.orders where id = v_candidate_order_id
  ) then
    v_order_id := v_candidate_order_id;
  else
    v_order_id := null;
  end if;

  insert into public.resend_webhook_events (
    svix_id,
    event_type,
    resend_email_id,
    order_id,
    referenced_order_id,
    processing_status,
    event_created_at
  ) values (
    p_svix_id,
    p_event_type,
    p_email_id,
    v_order_id,
    p_order_id,
    case when v_order_id is null then 'unmatched' else 'matched' end,
    p_event_at
  )
  on conflict (svix_id) do nothing;

  get diagnostics v_inserted_count = row_count;
  if v_inserted_count = 0 then
    select processing_status, order_id
    into v_existing_status, v_existing_order_id
    from public.resend_webhook_events
    where svix_id = p_svix_id;

    return jsonb_build_object(
      'duplicate', true,
      'matched', v_existing_status = 'matched',
      'order_id', v_existing_order_id,
      'processing_status', v_existing_status
    );
  end if;

  if v_order_id is null then
    return jsonb_build_object(
      'duplicate', false,
      'matched', false,
      'order_id', null,
      'processing_status', 'unmatched'
    );
  end if;

  insert into public.order_email_deliveries as deliveries (
    resend_email_id,
    order_id,
    email_type,
    recipient,
    delivery_status,
    last_event,
    last_event_at,
    failure_reason,
    sent_at,
    delivered_at,
    updated_at
  ) values (
    p_email_id,
    v_order_id,
    coalesce(v_email_type, 'transactional'),
    coalesce(v_recipient, 'unknown'),
    p_delivery_status,
    p_event_type,
    p_event_at,
    p_failure_reason,
    p_event_at,
    case when p_delivery_status = 'delivered' then p_event_at else null end,
    now()
  )
  on conflict (resend_email_id) do update
  set
    delivery_status = excluded.delivery_status,
    last_event = excluded.last_event,
    last_event_at = excluded.last_event_at,
    failure_reason = excluded.failure_reason,
    delivered_at = case
      when excluded.delivery_status = 'delivered'
        then coalesce(deliveries.delivered_at, excluded.last_event_at)
      else deliveries.delivered_at
    end,
    updated_at = now()
  where deliveries.last_event_at <= excluded.last_event_at;

  update public.orders
  set
    email_delivery_status = p_delivery_status,
    email_last_event = p_event_type,
    email_last_event_at = p_event_at,
    email_failure_reason = p_failure_reason,
    email_delivery_requires_attention = p_requires_attention,
    confirmation_email_sent_at = case
      when v_email_type = 'order_confirmation'
        then coalesce(confirmation_email_sent_at, p_event_at)
      else confirmation_email_sent_at
    end,
    confirmation_email_delivered_at = case
      when v_email_type = 'order_confirmation' and p_delivery_status = 'delivered'
        then coalesce(confirmation_email_delivered_at, p_event_at)
      else confirmation_email_delivered_at
    end
  where id = v_order_id
    and (email_last_event_at is null or email_last_event_at <= p_event_at);

  return jsonb_build_object(
    'duplicate', false,
    'matched', true,
    'order_id', v_order_id,
    'processing_status', 'matched'
  );
end;
$$;

revoke execute on function public.apply_resend_delivery_event(
  text, text, text, timestamptz, uuid, text, text, text, text, boolean
) from public, anon, authenticated;

grant execute on function public.apply_resend_delivery_event(
  text, text, text, timestamptz, uuid, text, text, text, text, boolean
) to service_role;
