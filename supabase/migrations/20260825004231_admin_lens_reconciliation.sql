begin;

-- The admin route supplies a fully validated patch and event payload. Keeping
-- both writes in this single PL/pgSQL function means an error in either the
-- orders update or the audit insert rolls back the entire reconciliation.
create function public.apply_admin_lens_reconciliation(
  p_order_id uuid,
  p_patch jsonb,
  p_event jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order jsonb;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'admin lens reconciliation patch is required';
  end if;
  if p_event is null or jsonb_typeof(p_event) <> 'object' then
    raise exception 'admin lens reconciliation audit event is required';
  end if;
  if coalesce(nullif(trim(p_event->>'event_type'), ''), '') = '' then
    raise exception 'admin lens reconciliation audit event type is required';
  end if;

  update public.orders as orders
  set
    rx = p_patch->'rx',
    sku = p_patch->>'sku',
    manufacturer = p_patch->>'manufacturer',
    rx_lens_brand = p_patch->>'rx_lens_brand',
    right_box_count = (p_patch->>'right_box_count')::integer,
    left_box_count = (p_patch->>'left_box_count')::integer,
    total_box_count = (p_patch->>'total_box_count')::integer,
    box_count = (p_patch->>'box_count')::integer,
    adjusted_right_box_count = (p_patch->>'adjusted_right_box_count')::integer,
    adjusted_left_box_count = (p_patch->>'adjusted_left_box_count')::integer,
    adjusted_total_box_count = (p_patch->>'adjusted_total_box_count')::integer,
    order_quantity_adjustment_reason = p_patch->>'order_quantity_adjustment_reason',
    order_quantity_adjusted_by = p_patch->>'order_quantity_adjusted_by',
    order_quantity_adjusted_at = (p_patch->>'order_quantity_adjusted_at')::timestamptz,
    verification_status = p_patch->>'verification_status',
    verification_passed = (p_patch->>'verification_passed')::boolean,
    verification_method = p_patch->>'verification_method',
    verification_completed_at = (p_patch->>'verification_completed_at')::timestamptz,
    rx_status = p_patch->>'rx_status',
    status = case
      when p_patch ? 'status' then p_patch->>'status'
      else orders.status
    end,
    payment_status = case
      when p_patch ? 'payment_status' then p_patch->>'payment_status'
      else orders.payment_status
    end,
    capture_amount_cents = case
      when p_patch ? 'capture_amount_cents'
        then (p_patch->>'capture_amount_cents')::integer
      else orders.capture_amount_cents
    end,
    fulfillment_status = case
      when p_patch ? 'fulfillment_status' then p_patch->>'fulfillment_status'
      else orders.fulfillment_status
    end,
    admin_notes = p_patch->>'admin_notes',
    updated_at = (p_patch->>'updated_at')::timestamptz
  where orders.id = p_order_id
  returning to_jsonb(orders) into v_order;

  if v_order is null then
    raise exception 'order % was not found', p_order_id using errcode = 'P0002';
  end if;

  insert into public.order_events (
    order_id,
    event_type,
    actor,
    message,
    before,
    after
  ) values (
    p_order_id,
    p_event->>'event_type',
    nullif(trim(p_event->>'actor'), ''),
    nullif(trim(p_event->>'message'), ''),
    p_event->'before',
    p_event->'after'
  );

  return v_order;
end;
$$;

revoke all on function public.apply_admin_lens_reconciliation(uuid, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_admin_lens_reconciliation(uuid, jsonb, jsonb)
  to service_role;

commit;
