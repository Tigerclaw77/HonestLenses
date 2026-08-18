import { CORE_TO_SKUS } from "@/lib/pricing/resolveDefaultSku";
import { getSkuBoxDurationMonths } from "@/lib/pricing/skuDefaults";

export type PackSizeOption = {
  sku: string;
  packSize: number;
  durationMonths: number;
};

/** Shared selection primitive for both source-managed and managed SKUs. */
export function getNextSmallerPackSizeOptionFromOptions(
  options: readonly PackSizeOption[],
  currentSku: string | null | undefined,
): PackSizeOption | null {
  if (!currentSku) return null;
  const current = options.find((option) => option.sku === currentSku);
  if (!current) return null;
  return [...options]
    .sort((a, b) => b.packSize - a.packSize || b.sku.localeCompare(a.sku))
    .find((option) => option.packSize < current.packSize) ?? null;
}

function getPackSize(sku: string): number | null {
  const match = /_(\d+)$/.exec(sku);
  return match ? Number(match[1]) : null;
}

export function getOrderPackCoreId({
  rightCoreId,
  leftCoreId,
}: {
  rightCoreId?: string | null;
  leftCoreId?: string | null;
}): string | null {
  if (rightCoreId && leftCoreId && rightCoreId !== leftCoreId) return null;
  return rightCoreId ?? leftCoreId ?? null;
}

export function getPackSizeOptionsForCoreId(coreId: string): PackSizeOption[] {
  return (CORE_TO_SKUS[coreId] ?? [])
    .map((sku) => {
      const packSize = getPackSize(sku);
      if (!packSize) return null;
      return { sku, packSize, durationMonths: getSkuBoxDurationMonths(sku) };
    })
    .filter((option): option is PackSizeOption => option !== null)
    .sort((a, b) => a.packSize - b.packSize || a.sku.localeCompare(b.sku));
}

export function isSkuAvailableForCoreId(coreId: string, sku: string): boolean {
  return getPackSizeOptionsForCoreId(coreId).some((option) => option.sku === sku);
}

export function getPersistedPackSku(
  coreId: string,
  currentSku: string | null | undefined,
  hasStoredQuantity: boolean,
): string | null {
  return currentSku && hasStoredQuantity && isSkuAvailableForCoreId(coreId, currentSku)
    ? currentSku
    : null;
}

export function canChangeOrderPackSize({
  adjusted,
  requestedSku,
  previousSku,
}: {
  adjusted: boolean;
  requestedSku: string | null;
  previousSku: string | null;
}): boolean {
  return !(adjusted && requestedSku !== null && requestedSku !== previousSku);
}

export function getNextSmallerPackSizeOption(
  coreId: string,
  currentSku: string | null | undefined,
): PackSizeOption | null {
  const options = getPackSizeOptionsForCoreId(coreId);
  return getNextSmallerPackSizeOptionFromOptions(options, currentSku);
}

/** Preserves intended supply duration when an order-level pack size changes. */
export function convertPackSizeQuantity(
  quantity: number | null | undefined,
  fromSku: string,
  toSku: string,
): number | null {
  if (quantity === null || quantity === undefined) return null;
  if (quantity <= 0) return 0;
  const fromMonths = getSkuBoxDurationMonths(fromSku);
  const toMonths = getSkuBoxDurationMonths(toSku);
  if (toMonths <= 0) return null;
  return Math.max(1, Math.round(quantity * (fromMonths / toMonths)));
}
