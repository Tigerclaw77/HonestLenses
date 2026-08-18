export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { listManagedCatalogFamilies } from "@/lib/managedCatalog/repository";
import { managedInputToLensCore } from "@/lib/managedCatalog/validation";
import { supabaseServer } from "@/lib/supabase-server";

/** Public, browse-safe supplement to the source-backed LensCore catalog. */
export async function GET() {
  try {
    const families = (await listManagedCatalogFamilies())
      .filter((family) => family.active && family.browseVisible)
      .map((family) => ({
        lens: managedInputToLensCore(family),
        skus: family.skus.filter((sku) => sku.active !== false).map((sku) => ({ sku: sku.sku, packSize: sku.packSize, pricePerBoxCents: sku.pricePerBoxCents })),
        primaryImageUrl: (() => {
          const path = family.images.find((image) => image.isPrimary)?.storagePath;
          return path ? supabaseServer.storage.from("catalog-images").getPublicUrl(path).data.publicUrl : null;
        })(),
      }));
    return NextResponse.json({ lenses: families.map((family) => family.lens), families });
  } catch {
    // Until the migration is applied, existing customer lens selection retains
    // its current source-only behaviour.
    return NextResponse.json({ lenses: [] });
  }
}
