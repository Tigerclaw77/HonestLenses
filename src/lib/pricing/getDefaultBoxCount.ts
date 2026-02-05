// src/lib/pricing/getDefaultBoxCount.ts
import { SKU_BOX_DURATION_MONTHS } from "./skuDefaults";

export function getDefaultBoxCount(
  sku: string,
  targetMonths: 6 | 12
): number {
  const boxMonths = SKU_BOX_DURATION_MONTHS[sku];

  if (!boxMonths) {
    throw new Error(`No duration defined for SKU: ${sku}`);
  }

  return Math.ceil(targetMonths / boxMonths);
}
