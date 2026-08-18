import type { PriceResult } from "@/lib/pricing/getPrice";
import { getNextSmallerPackSizeOptionFromOptions, type PackSizeOption } from "@/lib/cart/packSizeSelection";
import { normalizeShippingMethod, resolveShipping, type ShippingMethod } from "@/lib/shipping/resolveShipping";
import type { ManagedCatalogFamily, ManagedCatalogSku } from "./types";

const REPLACEMENT_DAYS = { DD: 1, "1W": 7, "2W": 14, "1M": 30 } as const;

export function getManagedPackSizeOptions(family: Pick<ManagedCatalogFamily, "replacement" | "skus">): PackSizeOption[] {
  const days = REPLACEMENT_DAYS[family.replacement];
  return family.skus.filter((sku) => sku.active !== false).map((sku) => ({ sku: sku.sku, packSize: sku.packSize, durationMonths: Math.max(1, Math.round((sku.packSize * days) / 30)) })).sort((a, b) => a.packSize - b.packSize || a.sku.localeCompare(b.sku));
}

export function getManagedDefaultSku(family: Pick<ManagedCatalogFamily, "replacement" | "skus">, targetMonths = 6): string | null {
  const options = getManagedPackSizeOptions(family);
  if (!options.length) return null;
  return options.find((option) => option.durationMonths >= targetMonths)?.sku ?? options[options.length - 1]?.sku ?? null;
}

export function getManagedNextSmallerPack(family: Pick<ManagedCatalogFamily, "replacement" | "skus">, currentSku: string | null | undefined): PackSizeOption | null {
  return getNextSmallerPackSizeOptionFromOptions(getManagedPackSizeOptions(family), currentSku);
}

export function getManagedPrice(
  sku: Pick<ManagedCatalogSku, "pricePerBoxCents">,
  boxCount: number,
  manufacturer: ManagedCatalogFamily["manufacturer"],
): PriceResult {
  if (!Number.isInteger(boxCount) || boxCount < 0) throw new Error("Box count must be a non-negative integer.");
  const pricingManufacturer = manufacturer === "VISTAKON" ? "vistakon" : manufacturer === "ALCON" ? "alcon" : manufacturer === "BAUSCH + LOMB" ? "bausch" : "coopervision";
  return { manufacturer: pricingManufacturer, price_per_box_cents: sku.pricePerBoxCents, total_amount_cents: sku.pricePerBoxCents * boxCount, price_reason: "managed_catalog_retail_v1" };
}

export function getManagedSkuDurationMonths(family: Pick<ManagedCatalogFamily, "replacement" | "skus">, sku: string): number {
  const option = getManagedPackSizeOptions(family).find((item) => item.sku === sku);
  if (!option) throw new Error(`Managed SKU ${sku} does not belong to this family.`);
  return option.durationMonths;
}

export function convertManagedPackSizeQuantity(family: Pick<ManagedCatalogFamily, "replacement" | "skus">, quantity: number | null | undefined, fromSku: string, toSku: string): number | null {
  if (quantity == null) return null;
  if (quantity <= 0) return 0;
  return Math.max(1, Math.round(quantity * (getManagedSkuDurationMonths(family, fromSku) / getManagedSkuDurationMonths(family, toSku))));
}

export function deriveManagedTotalMonths({
  family,
  sku,
  totalBoxes,
  rightBoxCount,
  leftBoxCount,
}: {
  family: Pick<ManagedCatalogFamily, "replacement" | "skus">;
  sku: string;
  totalBoxes: number;
  rightBoxCount?: number | null;
  leftBoxCount?: number | null;
}): number {
  const monthsPerBox = getManagedSkuDurationMonths(family, sku);
  const sideCounts = [rightBoxCount, leftBoxCount].filter(
    (count): count is number => typeof count === "number" && count > 0,
  );
  return sideCounts.length
    ? Math.min(...sideCounts.map((count) => count * monthsPerBox))
    : totalBoxes * monthsPerBox;
}

export function getManagedOrderQuote({ family, sku, totalBoxes, rightBoxCount, leftBoxCount, shippingMethod }: { family: ManagedCatalogFamily; sku: string; totalBoxes: number; rightBoxCount?: number | null; leftBoxCount?: number | null; shippingMethod?: ShippingMethod | null }) {
  const selectedSku = family.skus.find((item) => item.sku === sku && item.active !== false);
  if (!selectedSku) throw new Error("Managed SKU is not active for this family.");
  const pricing = getManagedPrice(selectedSku, totalBoxes, family.manufacturer);
  const totalMonths = deriveManagedTotalMonths({
    family,
    sku,
    totalBoxes,
    rightBoxCount,
    leftBoxCount,
  });
  const shipping = resolveShipping({ manufacturer: pricing.manufacturer, totalMonths, itemCount: totalBoxes, hasMixedSkus: false, shippingMethod: normalizeShippingMethod(shippingMethod) });
  return { manufacturer: pricing.manufacturer, totalMonths, shippingMethod: shipping.shippingMethod, shippingCents: shipping.shippingCents, totalAmountCents: pricing.total_amount_cents + shipping.shippingCents, priceReason: pricing.price_reason };
}
