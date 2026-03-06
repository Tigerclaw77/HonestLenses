import { lenses } from "@/LensCore";
import { getPackSizeFromSku } from "./skuPackSize";

export function getLensDisplayName(
  coreId: string,
  sku: string | null,
): string {
  const lens = lenses.find((l) => l.coreId === coreId);
  if (!lens) return "Unknown Lens";

  const baseName = lens.displayName.trim();

  if (!sku) return baseName;

  const packSize = getPackSizeFromSku(sku);
  if (!packSize) return baseName;

  return `${baseName} (${packSize}-pack)`;
}