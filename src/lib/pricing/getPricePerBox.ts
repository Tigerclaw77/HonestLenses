import { getPrice } from "./getPrice";

export function getPricePerBox(sku: string): number | null {
  try {
    const result = getPrice({
      sku,
      box_count: 1,
    });

    return result.price_per_box_cents;
  } catch {
    return null;
  }
}