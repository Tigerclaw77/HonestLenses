import { readdirSync } from "node:fs";
import path from "node:path";
import { lenses } from "@/LensCore/data/lenses";
import CatalogOperationsConsole from "./CatalogOperationsConsole";
import ManagedCatalogWorkflow from "./ManagedCatalogWorkflow";
import { listManagedCatalogFamilies } from "@/lib/managedCatalog/repository";
import {
  buildLensSummary,
  buildMappedSkuList,
  buildPricingIndex,
  findGlobalCatalogIssues,
  getCatalogManufacturers,
  getCatalogReplacements,
} from "@/lib/catalogOps/validation";
import type { CatalogSnapshot } from "@/lib/catalogOps/types";
import type { ManagedCatalogFamily } from "@/lib/managedCatalog/types";

function getLensImageAssetNames(): string[] {
  const imageDir = path.join(process.cwd(), "public", "lens-images");

  return readdirSync(imageDir)
    .filter((name) => /\.(webp|png|jpe?g)$/i.test(name))
    .sort();
}

export default async function AdminCatalogPage() {
  const assetNames = getLensImageAssetNames();
  const pricingIndex = buildPricingIndex();
  const lensSummaries = lenses
    .map((lens) => buildLensSummary(lens, assetNames, pricingIndex))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  const snapshot: CatalogSnapshot = {
    lenses: lensSummaries,
    manufacturers: getCatalogManufacturers(),
    replacements: getCatalogReplacements(),
    assetNames,
    pricingIndex,
    mappedSkus: buildMappedSkuList(),
    globalIssues: findGlobalCatalogIssues(lensSummaries, pricingIndex),
  };

  let managedFamilies: ManagedCatalogFamily[] = [];
  let managedStorageAvailable = true;
  try {
    managedFamilies = await listManagedCatalogFamilies();
  } catch {
    // Deploying source before its migration must not make the read-only
    // legacy catalog console unavailable.
    managedStorageAvailable = false;
  }

  return <>
    <CatalogOperationsConsole snapshot={snapshot} />
    <ManagedCatalogWorkflow initialFamilies={managedFamilies} storageAvailable={managedStorageAvailable} />
  </>;
}
