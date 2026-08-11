-- Short-lived, server-managed capabilities for desktop-to-phone Rx capture.
-- Raw capability tokens are never stored; only their SHA-256 hashes persist.
create table public.prescription_mobile_handoffs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  token_hash text not null unique
    check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  completed_at timestamptz,
  upload_claim_id uuid,
  upload_claim_expires_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (completed_at is null or completed_at >= created_at),
  check (
    completed_at is null
    or (upload_claim_id is null and upload_claim_expires_at is null)
  ),
  check (
    (upload_claim_id is null and upload_claim_expires_at is null)
    or (upload_claim_id is not null and upload_claim_expires_at is not null)
  ),
  check (
    upload_claim_expires_at is null
    or upload_claim_expires_at > created_at
  )
);

create index prescription_mobile_handoffs_active_order_idx
  on public.prescription_mobile_handoffs (order_id, expires_at)
  where completed_at is null;
create index prescription_mobile_handoffs_active_token_idx
  on public.prescription_mobile_handoffs (token_hash, expires_at)
  where completed_at is null;
create index prescription_mobile_handoffs_expiry_idx
  on public.prescription_mobile_handoffs (expires_at)
  where completed_at is null;

alter table public.prescription_mobile_handoffs enable row level security;
revoke all on table public.prescription_mobile_handoffs
  from public, anon, authenticated;
grant select, insert, update, delete on table public.prescription_mobile_handoffs
  to service_role;
