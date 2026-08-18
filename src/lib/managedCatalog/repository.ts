import { supabaseServer } from "@/lib/supabase-server";
import type { ManagedCatalogFamily, ManagedCatalogFamilyInput } from "./types";

type FamilyRow = { id: string; core_id: string; current_version_id: string; created_at: string; updated_at: string };
type VersionRow = { id: string; family_id: string; version: number; display_name: string; manufacturer: ManagedCatalogFamily["manufacturer"]; replacement: ManagedCatalogFamily["replacement"]; toric: boolean; multifocal: boolean; active: boolean; browse_visible: boolean; parameters: ManagedCatalogFamily["parameters"]; vendor_order_identifier: string | null; created_at: string };
type SkuRow = { sku: string; pack_size: number; retail_price_cents: number; vendor_sku: string | null; vendor_order_identifier: string | null; active: boolean };
type ImageRow = { storage_path: string; alt_text: string | null; position: number; is_primary: boolean };

function asFamily(row: FamilyRow, version: VersionRow, skus: SkuRow[], images: ImageRow[]): ManagedCatalogFamily {
  return {
    id: row.id,
    versionId: version.id,
    version: version.version,
    coreId: row.core_id,
    displayName: version.display_name,
    manufacturer: version.manufacturer,
    replacement: version.replacement,
    type: { toric: version.toric, multifocal: version.multifocal },
    parameters: version.parameters,
    active: version.active,
    browseVisible: version.browse_visible,
    vendorOrderIdentifier: version.vendor_order_identifier,
    skus: skus.map((sku) => ({ sku: sku.sku, packSize: sku.pack_size, pricePerBoxCents: sku.retail_price_cents, vendorSku: sku.vendor_sku, vendorOrderIdentifier: sku.vendor_order_identifier, active: sku.active })),
    images: images.map((image) => ({ storagePath: image.storage_path, altText: image.alt_text, position: image.position, isPrimary: image.is_primary })),
    createdAt: version.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listManagedCatalogFamilies(): Promise<ManagedCatalogFamily[]> {
  const { data: families, error: familyError } = await supabaseServer.from("catalog_managed_families").select("id, core_id, current_version_id, created_at, updated_at").order("core_id");
  if (familyError) throw familyError;
  if (!families?.length) return [];
  const versionIds = families.map((family) => family.current_version_id);
  const [{ data: versions, error: versionError }, { data: skus, error: skuError }, { data: images, error: imageError }] = await Promise.all([
    supabaseServer.from("catalog_managed_family_versions").select("id, family_id, version, display_name, manufacturer, replacement, toric, multifocal, active, browse_visible, parameters, vendor_order_identifier, created_at").in("id", versionIds),
    supabaseServer.from("catalog_managed_skus").select("family_version_id, sku, pack_size, retail_price_cents, vendor_sku, vendor_order_identifier, active").in("family_version_id", versionIds),
    supabaseServer.from("catalog_managed_images").select("family_version_id, storage_path, alt_text, position, is_primary").in("family_version_id", versionIds).order("position"),
  ]);
  if (versionError) throw versionError;
  if (skuError) throw skuError;
  if (imageError) throw imageError;
  const versionById = new Map((versions ?? []).map((version) => [version.id, version as VersionRow]));
  return (families as FamilyRow[]).flatMap((family) => {
    const version = versionById.get(family.current_version_id);
    if (!version) return [];
    return [asFamily(family, version, (skus ?? []).filter((sku) => sku.family_version_id === version.id) as SkuRow[], (images ?? []).filter((image) => image.family_version_id === version.id) as ImageRow[])];
  });
}

export async function publishManagedCatalogFamily(input: ManagedCatalogFamilyInput): Promise<string> {
  const payload = {
    coreId: input.coreId.trim(), displayName: input.displayName.trim(), manufacturer: input.manufacturer,
    replacement: input.replacement, toric: input.type.toric, multifocal: input.type.multifocal,
    active: input.active, browseVisible: input.browseVisible, parameters: input.parameters,
    vendorOrderIdentifier: input.vendorOrderIdentifier?.trim() || null,
    skus: input.skus.map((sku) => ({ sku: sku.sku.trim(), packSize: sku.packSize, retailPriceCents: sku.pricePerBoxCents, vendorSku: sku.vendorSku?.trim() || null, vendorOrderIdentifier: sku.vendorOrderIdentifier?.trim() || null, active: sku.active !== false })),
    images: input.images.map((image, index) => ({ storagePath: image.storagePath, altText: image.altText?.trim() || null, position: image.position ?? index, isPrimary: image.isPrimary !== false })),
  };
  const { data, error } = await supabaseServer.rpc("publish_managed_catalog_family", { payload });
  if (error) throw error;
  if (typeof data !== "string") throw new Error("Managed catalog publish returned no version id.");
  return data;
}
