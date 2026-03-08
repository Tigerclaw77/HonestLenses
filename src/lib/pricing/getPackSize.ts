export function getPackSizeFromSku(sku: string): number | null {
  const match = sku.match(/_(\d+)$/)
  return match ? Number(match[1]) : null
}