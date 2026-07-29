alter table public.orders
  add column if not exists email_delivery_status text,
  add column if not exists email_last_event text,
  add column if not exists email_last_event_at timestamptz,
  add column if not exists email_failure_reason text,
  add column if not exists email_delivery_requires_attention boolean not null default false,
  add column if not exists confirmation_email_sent_at timestamptz,
  add column if not exists confirmation_email_delivered_at timestamptz;

create table if not exists public.order_email_deliveries (
  resend_email_id text primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  email_type text not null,
  recipient text not null,
  delivery_status text not null,
  last_event text not null,
  last_event_at timestamptz not null,
  failure_reason text,
  sent_at timestamptz not null,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists order_email_deliveries_order_id_idx
  on public.order_email_deliveries(order_id);

create table if not exists public.resend_webhook_events (
  svix_id text primary key,
  event_type text not null,
  resend_email_id text,
  order_id uuid references public.orders(id) on delete set null,
  event_created_at timestamptz not null,
  received_at timestamptz not null default now()
);

create index if not exists resend_webhook_events_email_id_idx
  on public.resend_webhook_events(resend_email_id);

alter table public.order_email_deliveries enable row level security;
alter table public.resend_webhook_events enable row level security;

create or replace function public.record_transactional_email_send(
  p_email_id text,
  p_order_id uuid,
  p_email_type text,
  p_recipient text,
  p_sent_at timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (select 1 from public.orders where id = p_order_id) then
    return false;
  end if;

  insert into public.order_email_deliveries (
    resend_email_id,
    order_id,
    email_type,
    recipient,
    delivery_status,
    last_event,
    last_event_at,
    sent_at
  ) values (
    p_email_id,
    p_order_id,
    p_email_type,
    p_recipient,
    'sent',
    'email.sent',
    p_sent_at,
    p_sent_at
  )
  on conflict (resend_email_id) do nothing;

  update public.orders
  set
    email_delivery_status = case
      when (email_last_event_at is null or email_last_event_at <= p_sent_at)
        and not email_delivery_requires_attention
        then 'sent'
      else email_delivery_status
    end,
    email_last_event = case
      when email_last_event_at is null or email_last_event_at <= p_sent_at
        then 'email.sent'
      else email_last_event
    end,
    email_last_event_at = case
      when email_last_event_at is null or email_last_event_at <= p_sent_at
        then p_sent_at
      else email_last_event_at
    end,
    email_failure_reason = case
      when (email_last_event_at is null or email_last_event_at <= p_sent_at)
        and not email_delivery_requires_attention
        then null
      else email_failure_reason
    end,
    confirmation_email_sent_at = case
      when p_email_type = 'order_confirmation'
        then coalesce(confirmation_email_sent_at, p_sent_at)
      else confirmation_email_sent_at
    end
  where id = p_order_id;

  return true;
end;
$$;

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
  v_order_id uuid := p_order_id;
  v_email_type text := p_email_type;
  v_recipient text := p_recipient;
  v_linked_order_id uuid;
  v_linked_email_type text;
  v_linked_recipient text;
begin
  insert into public.resend_webhook_events (
    svix_id,
    event_type,
    resend_email_id,
    order_id,
    event_created_at
  ) values (
    p_svix_id,
    p_event_type,
    p_email_id,
    p_order_id,
    p_event_at
  )
  on conflict (svix_id) do nothing;

  get diagnostics v_inserted_count = row_count;
  if v_inserted_count = 0 then
    return jsonb_build_object('duplicate', true, 'matched', false);
  end if;

  select
    order_id,
    email_type,
    recipient
  into v_linked_order_id, v_linked_email_type, v_linked_recipient
  from public.order_email_deliveries
  where resend_email_id = p_email_id;

  v_order_id := coalesce(v_linked_order_id, v_order_id);
  v_email_type := coalesce(v_linked_email_type, v_email_type);
  v_recipient := coalesce(v_linked_recipient, v_recipient);

  if v_order_id is null or not exists (
    select 1 from public.orders where id = v_order_id
  ) then
    return jsonb_build_object('duplicate', false, 'matched', false);
  end if;

  update public.resend_webhook_events
  set order_id = v_order_id
  where svix_id = p_svix_id;

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
    'order_id', v_order_id
  );
end;
$$;

revoke all on public.order_email_deliveries from public, anon, authenticated;
revoke all on public.resend_webhook_events from public, anon, authenticated;
grant select, insert, update on public.order_email_deliveries to service_role;
grant select, insert, update on public.resend_webhook_events to service_role;

revoke execute on function public.record_transactional_email_send(
  text, uuid, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.record_transactional_email_send(
  text, uuid, text, text, timestamptz
) to service_role;

revoke execute on function public.apply_resend_delivery_event(
  text, text, text, timestamptz, uuid, text, text, text, text, boolean
) from public, anon, authenticated;
grant execute on function public.apply_resend_delivery_event(
  text, text, text, timestamptz, uuid, text, text, text, text, boolean
) to service_role;
