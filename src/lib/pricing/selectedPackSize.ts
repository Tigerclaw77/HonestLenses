import { CORE_TO_SKUS } from "./resolveDefaultSku";

export function getCompatibleSelectedSku(
  coreIds: Array<string | null | undefined>,
  requestedSku: string | null | undefined,
): string | null {
  const selectedCoreIds = [...new Set(coreIds.filter((coreId): coreId is string => Boolean(coreId)))];
  const sku = requestedSku?.trim() ?? "";

  if (!sku || selectedCoreIds.length === 0) return null;

  return selectedCoreIds.every((coreId) =>
    (CORE_TO_SKUS[coreId] ?? []).includes(sku),
  )
    ? sku
    : null;
}
