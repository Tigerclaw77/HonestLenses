// src/lib/pricing/getPrice.ts

import { VISTAKON_PRICING } from "./vistakon";
import { BAUSCH_PRICING } from "./bausch";
// import { COOPERVISION_PRICING } from "./coopervision";
// import { ALCON_PRICING } from "./alcon";

type GetPriceInput = {
  sku: string;
  box_count: number;
};

export type PriceResult = {
  price_per_box_cents: number;
  total_amount_cents: number;
  price_reason: string;
};

export function getPrice({ sku, box_count }: GetPriceInput): PriceResult {
  const entry =
    VISTAKON_PRICING[sku as keyof typeof VISTAKON_PRICING] ??
    BAUSCH_PRICING[sku as keyof typeof BAUSCH_PRICING];
    // ?? COOPERVISION_PRICING[sku as keyof typeof COOPERVISION_PRICING]
    // ?? ALCON_PRICING[sku as keyof typeof ALCON_PRICING];

  if (!entry) {
    throw new Error(`PRICING_V1_MISSING_SKU:${sku}`);
  }

  return {
    price_per_box_cents: entry.price_per_box_cents,
    total_amount_cents: entry.price_per_box_cents * box_count,
    price_reason: "flat_retail_v1",
  };
}
