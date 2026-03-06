// src/lib/pricing/getDefaultBoxCount.ts

import { getSkuBoxDurationMonths } from "./skuDefaults";

type TargetMonths = 6 | 12;

export function getDefaultBoxCount(
  sku: string,
  targetMonths: TargetMonths
): number {
  const boxMonths = getSkuBoxDurationMonths(sku);

  if (boxMonths === undefined) {
    throw new Error(`PRICING_V1_UNKNOWN_SKU_DURATION: ${sku}`);
  }

  // Example:
  // 12 month target / 3 month box = 4 boxes
  return Math.ceil(targetMonths / boxMonths);
}