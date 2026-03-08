import { getPricePerBox } from "./getPricePerBox";

export function getLowestPrice(skus: string[]): number | null {
  const prices = skus
    .map((sku) => getPricePerBox(sku))
    .filter((p): p is number => p !== null);

  if (!prices.length) return null;

  return Math.min(...prices);
}