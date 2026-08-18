-- Versioned, admin-managed catalog records. Legacy LensCore families remain
-- source-backed and are intentionally not copied into these tables.

create table public.catalog_managed_families (
  id uuid primary key default gen_random_uuid(),
  core_id text not null unique check (core_id ~ '^[A-Z0-9_]+$'),
  current_version_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table public.catalog_managed_family_versions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.catalog_managed_families(id) on delete restrict,
  version integer not null check (version > 0),
  display_name text not null check (length(trim(display_name)) > 0),
  manufacturer text not null check (manufacturer in ('VISTAKON', 'ALCON', 'BAUSCH + LOMB', 'COOPERVISION')),
  replacement text not null check (replacement in ('DD', '1W', '2W', '1M')),
  toric boolean not null default false,
  multifocal boolean not null default false,
  active boolean not null default true,
  browse_visible boolean not null default true,
  parameters jsonb not null,
  vendor_order_identifier text,
  created_at timestamptz not null default now(),
  created_by uuid,
  unique (family_id, version)
);

alter table public.catalog_managed_families
  add constraint catalog_managed_families_current_version_fkey
  foreign key (current_version_id)
  references public.catalog_managed_family_versions(id)
  on delete restrict;

create table public.catalog_managed_skus (
  id uuid primary key default gen_random_uuid(),
  family_version_id uuid not null references public.catalog_managed_family_versions(id) on delete restrict,
  sku text not null unique,
  pack_size integer not null check (pack_size > 0),
  retail_price_cents integer not null check (retail_price_cents >= 0),
  currency text not null default 'USD' check (currency = upper(currency) and length(currency) = 3),
  active boolean not null default true,
  vendor_sku text,
  vendor_order_identifier text,
  created_at timestamptz not null default now(),
  unique (family_version_id, sku)
);

create table public.catalog_managed_images (
  id uuid primary key default gen_random_uuid(),
  family_version_id uuid not null references public.catalog_managed_family_versions(id) on delete restrict,
  storage_path text not null,
  alt_text text,
  position integer not null default 0 check (position >= 0),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (family_version_id, storage_path)
);

create unique index catalog_managed_images_one_primary_per_version
  on public.catalog_managed_images (family_version_id)
  where is_primary;

create index catalog_managed_family_versions_family_created_idx
  on public.catalog_managed_family_versions (family_id, version desc);
create index catalog_managed_skus_version_idx
  on public.catalog_managed_skus (family_version_id, active);
create index catalog_managed_images_version_idx
  on public.catalog_managed_images (family_version_id, position);

create or replace function public.catalog_managed_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger catalog_managed_families_set_updated_at
before update on public.catalog_managed_families
for each row execute function public.catalog_managed_set_updated_at();

-- Called only by the server's service-role client. A revision row is immutable:
-- an edit atomically appends a version and advances the family pointer.
create or replace function public.publish_managed_catalog_family(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_core_id text := upper(trim(payload->>'coreId'));
  v_family_id uuid;
  v_version_id uuid;
  v_next_version integer;
  v_item jsonb;
begin
  if v_core_id is null or v_core_id !~ '^[A-Z0-9_]+$' then
    raise exception 'catalog coreId is invalid';
  end if;

  insert into public.catalog_managed_families (core_id, created_by, updated_by)
  values (v_core_id, auth.uid(), auth.uid())
  on conflict (core_id) do update
    set updated_by = auth.uid()
  returning id into v_family_id;

  select coalesce(max(version), 0) + 1
    into v_next_version
  from public.catalog_managed_family_versions
  where family_id = v_family_id;

  insert into public.catalog_managed_family_versions (
    family_id, version, display_name, manufacturer, replacement, toric,
    multifocal, active, browse_visible, parameters, vendor_order_identifier,
    created_by
  ) values (
    v_family_id,
    v_next_version,
    trim(payload->>'displayName'),
    payload->>'manufacturer',
    payload->>'replacement',
    coalesce((payload->>'toric')::boolean, false),
    coalesce((payload->>'multifocal')::boolean, false),
    coalesce((payload->>'active')::boolean, true),
    coalesce((payload->>'browseVisible')::boolean, true),
    coalesce(payload->'parameters', '{}'::jsonb),
    nullif(trim(payload->>'vendorOrderIdentifier'), ''),
    auth.uid()
  ) returning id into v_version_id;

  for v_item in select value from jsonb_array_elements(coalesce(payload->'skus', '[]'::jsonb)) loop
    insert into public.catalog_managed_skus (
      family_version_id, sku, pack_size, retail_price_cents, currency, active,
      vendor_sku, vendor_order_identifier
    ) values (
      v_version_id,
      upper(trim(v_item->>'sku')),
      (v_item->>'packSize')::integer,
      (v_item->>'retailPriceCents')::integer,
      coalesce(nullif(upper(trim(v_item->>'currency')), ''), 'USD'),
      coalesce((v_item->>'active')::boolean, true),
      nullif(trim(v_item->>'vendorSku'), ''),
      nullif(trim(v_item->>'vendorOrderIdentifier'), '')
    );
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(payload->'images', '[]'::jsonb)) loop
    insert into public.catalog_managed_images (
      family_version_id, storage_path, alt_text, position, is_primary
    ) values (
      v_version_id,
      trim(v_item->>'storagePath'),
      nullif(trim(v_item->>'altText'), ''),
      coalesce((v_item->>'position')::integer, 0),
      coalesce((v_item->>'isPrimary')::boolean, false)
    );
  end loop;

  update public.catalog_managed_families
    set current_version_id = v_version_id,
        updated_by = auth.uid()
  where id = v_family_id;

  return v_version_id;
end;
$$;

alter table public.catalog_managed_families enable row level security;
alter table public.catalog_managed_family_versions enable row level security;
alter table public.catalog_managed_skus enable row level security;
alter table public.catalog_managed_images enable row level security;

revoke all privileges on table public.catalog_managed_families,
  public.catalog_managed_family_versions,
  public.catalog_managed_skus,
  public.catalog_managed_images from public, anon, authenticated;
grant select, insert, update, delete on table public.catalog_managed_families,
  public.catalog_managed_family_versions,
  public.catalog_managed_skus,
  public.catalog_managed_images to service_role;

revoke all privileges on function public.publish_managed_catalog_family(jsonb)
  from public, anon, authenticated;
grant execute on function public.publish_managed_catalog_family(jsonb) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'catalog-images',
  'catalog-images',
  true,
  5242880,
  array['image/jpeg', 'image/png']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
