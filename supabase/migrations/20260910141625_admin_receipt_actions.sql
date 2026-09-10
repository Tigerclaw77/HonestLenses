set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Reuse the append-only operational audit trail; no order or payment updates.
create index if not exists order_events_admin_receipt_idx
  on public.order_events (order_id, created_at desc)
  where event_type like 'admin_receipt_%';

create or replace function public.claim_admin_receipt_send(
  p_order_id uuid, p_request_id uuid, p_receipt_type text, p_actor text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_event public.order_events%rowtype;
begin
  if p_receipt_type not in ('receipt', 'itemized') or p_actor is null then
    raise exception 'Invalid receipt request';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('admin-receipt:' || p_order_id::text, 0));
  if not exists (select 1 from public.orders where id = p_order_id) then
    raise exception 'Order not found';
  end if;
  select * into v_event from public.order_events where order_id = p_order_id
    and event_type like 'admin_receipt_%' and "after"->>'request_id' = p_request_id::text
    order by created_at desc limit 1;
  if found then return jsonb_build_object('claimed', false, 'reason', 'This send request has already been recorded. Refresh receipt history.'); end if;

  -- Uncertain provider outcomes remain blocked, including after process crashes.
  -- Never expire a lock and risk a second email after Resend's idempotency window.
  if exists (select 1 from public.order_events requested
    where requested.order_id = p_order_id and requested.event_type = 'admin_receipt_requested'
      and requested."after"->>'receipt_type' = p_receipt_type
      and not exists (select 1 from public.order_events terminal
        where terminal.order_id = p_order_id
          and terminal.event_type in ('admin_receipt_sent', 'admin_receipt_failed')
          and terminal."after"->>'request_id' = requested."after"->>'request_id')) then
    return jsonb_build_object('claimed', false, 'reason', 'A send is pending or its delivery outcome needs review. Check Resend before retrying.');
  end if;
  if exists (select 1 from public.order_events where order_id = p_order_id
    and event_type = 'admin_receipt_requested' and "after"->>'receipt_type' = p_receipt_type
    and created_at > now() - interval '60 seconds') then
    return jsonb_build_object('claimed', false, 'reason', 'Please wait 60 seconds between receipt sends.');
  end if;
  insert into public.order_events(order_id, event_type, actor, message, "after")
    values (p_order_id, 'admin_receipt_requested', p_actor, 'Admin requested a customer receipt.',
      jsonb_build_object('request_id', p_request_id, 'receipt_type', p_receipt_type));
  return jsonb_build_object('claimed', true);
end;
$$;
revoke all on function public.claim_admin_receipt_send(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_admin_receipt_send(uuid, uuid, text, text) to service_role;
