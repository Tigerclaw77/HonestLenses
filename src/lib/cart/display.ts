import { lenses } from "../../data/lenses";
import { getPackSizeFromSku } from "./skuPackSize";

export function getLensDisplayName(
  lens_id: string,
  sku: string | null,
): string {
  const lens = lenses.find((l) => l.lens_id === lens_id);
  if (!lens) return "Unknown Lens";

  const brand = lens.brand?.trim() ?? "";
  const name = lens.name.trim();

  const baseName =
    brand &&
    !name.toLowerCase().startsWith(brand.toLowerCase())
      ? `${brand} ${name}`
      : name;

  if (!sku) return baseName;

  const packSize = getPackSizeFromSku(sku);
  if (!packSize) return baseName;

  return `${baseName} (${packSize}-pack)`;
}