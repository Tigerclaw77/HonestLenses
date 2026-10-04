import { lenses } from "@/LensCore/data/lenses";
import { getLensSkus } from "@/lib/pricing/getLensSkus";
import { getPackSizeFromSku } from "@/lib/pricing/getPackSize";
import { getPricePerBox } from "@/lib/pricing/getPricePerBox";
import { getLensSlug, isPublicCatalogLens } from "@/lib/seo/contactSeoRoutes";

export type CatalogPriceProduct = {
  coreId: string;
  name: string;
  manufacturer: string;
  replacement: string;
  href: string;
  options: {
    sku: string;
    boxSize: number;
    pricePerBoxCents: number;
  }[];
};

export function getCatalogPriceProducts(): CatalogPriceProduct[] {
  return lenses.filter(isPublicCatalogLens).flatMap((lens) => {
    const options = getLensSkus(lens).flatMap((sku) => {
      const boxSize = getPackSizeFromSku(sku);
      const pricePerBoxCents = getPricePerBox(sku);
      return boxSize && pricePerBoxCents !== null
        ? [{ sku, boxSize, pricePerBoxCents }]
        : [];
    }).sort((a, b) => a.boxSize - b.boxSize);

    return options.length
      ? [{
          coreId: lens.coreId,
          name: lens.displayName,
          manufacturer: lens.manufacturer,
          replacement: lens.replacement,
          href: `/contacts/${getLensSlug(lens)}`,
          options,
        }]
      : [];
  }).sort((a, b) => a.name.localeCompare(b.name));
}
