import { isSkuAvailableForCoreId } from "@/lib/pricing/packSizeOptions";
import { resolveDefaultSku } from "@/lib/pricing/resolveDefaultSku";

export function resolveSkuSelection(coreIds: string[], requestedSku: string | null, storedSku: string | null, targetMonths: 6 | 12) {
  const compatible = (sku: string) => coreIds.length > 0 && coreIds.every(id => isSkuAvailableForCoreId(id, sku));
  if (requestedSku && !compatible(requestedSku)) throw new Error("Requested pack size is not available for this lens.");
  const stored = storedSku && compatible(storedSku) ? storedSku : null;
  return { sku: requestedSku ?? stored ?? resolveDefaultSku(coreIds[0], targetMonths), hasCompatibleStoredQuantity: stored !== null };
}
