import { getPackSizeFromSku } from "./getPackSize";
import { getPrice } from "./getPrice";
import { CORE_TO_SKUS } from "./resolveDefaultSku";
import { getSkuBoxDurationMonths } from "./skuDefaults";

export type PackSizeOption = {
  sku: string;
  packSize: number;
  durationMonths: number;
  pricePerBoxCents: number;
  label: string;
};

function buildPackSizeOption(sku: string): PackSizeOption | null {
  const packSize = getPackSizeFromSku(sku);
  if (!packSize) return null;

  try {
    const price = getPrice({ sku, box_count: 1 });
    return {
      sku,
      packSize,
      durationMonths: getSkuBoxDurationMonths(sku),
      pricePerBoxCents: price.price_per_box_cents,
      label: `${packSize}-pack`,
    };
  } catch {
    return null;
  }
}

export function getPackSizeOptionsForCoreId(coreId: string): PackSizeOption[] {
  const seenSkus = new Set<string>();

  return (CORE_TO_SKUS[coreId] ?? [])
    .filter((sku) => {
      if (seenSkus.has(sku)) return false;
      seenSkus.add(sku);
      return true;
    })
    .map(buildPackSizeOption)
    .filter((option): option is PackSizeOption => option !== null)
    .sort((a, b) => a.packSize - b.packSize || a.sku.localeCompare(b.sku));
}

export function isSkuAvailableForCoreId(coreId: string, sku: string): boolean {
  return getPackSizeOptionsForCoreId(coreId).some((option) => option.sku === sku);
}

export function getNextSmallerPackSizeOption(
  coreId: string,
  currentSku: string | null | undefined,
): PackSizeOption | null {
  if (!currentSku) return null;

  const options = getPackSizeOptionsForCoreId(coreId);
  const current = options.find((option) => option.sku === currentSku);
  if (!current) return null;

  return (
    [...options]
      .reverse()
      .find((option) => option.packSize < current.packSize) ?? null
  );
}

export function getNextLargerPackSizeOption(
  coreId: string,
  currentSku: string | null | undefined,
): PackSizeOption | null {
  if (!currentSku) return null;

  const options = getPackSizeOptionsForCoreId(coreId);
  const current = options.find((option) => option.sku === currentSku);
  if (!current) return null;

  return options.find((option) => option.packSize > current.packSize) ?? null;
}

export function convertPackSizeQuantity(
  quantity: number,
  from: PackSizeOption,
  to: PackSizeOption,
): number {
  if (quantity <= 0) return 0;
  if (to.durationMonths <= 0) return 1;

  const converted = quantity * (from.durationMonths / to.durationMonths);
  return Math.max(1, Math.round(converted));
}
