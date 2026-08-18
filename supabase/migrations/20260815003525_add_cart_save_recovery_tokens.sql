-- Guest cart-save capabilities intentionally contain no email, prescription,
-- pricing, or shipping data. The cart remains the canonical order record;
-- this table holds only a short-lived recovery capability. The capability is
-- intentionally reusable until expiry so mail scanners and cross-device opens
-- do not consume a shopper's seven-day recovery window.
create table public.cart_save_tokens (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  token_hash text not null unique
    check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

-- token_hash is unique and therefore already indexed for recovery lookups.
create index cart_save_tokens_expiry_idx
  on public.cart_save_tokens (expires_at);

alter table public.cart_save_tokens enable row level security;
revoke all on table public.cart_save_tokens from public, anon, authenticated;
grant select, insert, update, delete on table public.cart_save_tokens to service_role;
