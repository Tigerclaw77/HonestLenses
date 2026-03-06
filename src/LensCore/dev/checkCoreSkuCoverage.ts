import { CORE_TO_SKUS } from "../../lib/pricing/resolveDefaultSku";
import { lenses } from "../../LensCore/data/lenses"; // <-- adjust THIS relative path only

const lensCoreIds = new Set(lenses.map((l) => l.coreId));

const missingInSkuMap = lenses
  .map((l) => l.coreId)
  .filter((id) => !(id in CORE_TO_SKUS));

const orphanSkuMappings = Object.keys(CORE_TO_SKUS).filter(
  (id) => !lensCoreIds.has(id),
);

if (missingInSkuMap.length || orphanSkuMappings.length) {
  const parts: string[] = [];
  if (missingInSkuMap.length) {
    parts.push(
      `Missing SKU mappings for coreIds:\n${missingInSkuMap.join("\n")}`,
    );
  }
  if (orphanSkuMappings.length) {
    parts.push(
      `CORE_TO_SKUS contains unknown coreIds:\n${orphanSkuMappings.join("\n")}`,
    );
  }
  throw new Error(parts.join("\n\n"));
}