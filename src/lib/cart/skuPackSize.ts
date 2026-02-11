/**
 * Extract physical lens count from SKU.
 * Convention: trailing _<number> is ALWAYS pack size.
 * Examples:
 *  - OASYS_24 → 24
 *  - DEFINE_30 → 30
 *  - MOIST_90 → 90
 *  - PRECISION7_27 → 27
 */
export function getPackSizeFromSku(sku: string): number | null {
  const match = sku.match(/_(\d+)$/);
  return match ? Number(match[1]) : null;
}
