create table if not exists security_private.order_recovery_email_send_claims (
  order_id uuid not null references public.orders(id) on delete cascade,
  recipient_email text not null,
  email_type text not null,
  claim_id uuid not null default gen_random_uuid(),
  claimed_at timestamptz not null default clock_timestamp(),
  primary key (order_id, recipient_email, email_type),
  check (recipient_email = lower(btrim(recipient_email))),
  check (email_type = 'order_recovery')
);

alter table security_private.order_recovery_email_send_claims
  enable row level security;

revoke all on table security_private.order_recovery_email_send_claims
  from public, anon, authenticated;

create or replace function public.claim_order_recovery_email_send(
  p_order_id uuid,
  p_recipient_email text,
  p_email_type text,
  p_cooldown_seconds integer
)
returns table (
  claim_id uuid,
  claimed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if
    p_order_id is null
    or p_recipient_email is null
    or p_recipient_email <> lower(btrim(p_recipient_email))
    or length(p_recipient_email) < 3
    or length(p_recipient_email) > 320
    or p_email_type <> 'order_recovery'
    or p_cooldown_seconds < 60
    or p_cooldown_seconds > 86400
  then
    raise exception 'invalid recovery email claim arguments';
  end if;

  return query
  insert into security_private.order_recovery_email_send_claims as claims (
    order_id,
    recipient_email,
    email_type,
    claim_id,
    claimed_at
  )
  values (
    p_order_id,
    p_recipient_email,
    p_email_type,
    gen_random_uuid(),
    clock_timestamp()
  )
  on conflict (order_id, recipient_email, email_type) do update
  set
    claim_id = gen_random_uuid(),
    claimed_at = clock_timestamp()
  where claims.claimed_at <=
    clock_timestamp() - make_interval(secs => p_cooldown_seconds)
  returning claims.claim_id, claims.claimed_at;
end
$$;

revoke all on function public.claim_order_recovery_email_send(
  uuid,
  text,
  text,
  integer
) from public, anon, authenticated;

grant execute on function public.claim_order_recovery_email_send(
  uuid,
  text,
  text,
  integer
) to service_role;
