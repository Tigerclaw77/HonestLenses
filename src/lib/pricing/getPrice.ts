// src/lib/pricing/getPrice.ts

import { VISTAKON_PRICING } from "./vistakon";
import { BAUSCH_PRICING } from "./bausch";
import { COOPERVISION_PRICING } from "./coopervision";
import { ALCON_PRICING } from "./alcon";

type GetPriceInput = {
  sku: string;
  box_count: number;
};

export type PriceResult = {
  price_per_box_cents: number;
  total_amount_cents: number;
  price_reason: string;
};

function lookupPricing(sku: string) {
  if (sku in VISTAKON_PRICING) {
    return VISTAKON_PRICING[sku as keyof typeof VISTAKON_PRICING];
  }
  if (sku in BAUSCH_PRICING) {
    return BAUSCH_PRICING[sku as keyof typeof BAUSCH_PRICING];
  }
  if (sku in COOPERVISION_PRICING) {
    return COOPERVISION_PRICING[sku as keyof typeof COOPERVISION_PRICING];
  }
  if (sku in ALCON_PRICING) {
    return ALCON_PRICING[sku as keyof typeof ALCON_PRICING];
  }
  return null;
}

export function getPrice({ sku, box_count }: GetPriceInput): PriceResult {
  const entry = lookupPricing(sku);

  if (!entry) {
    throw new Error(`PRICING_V1_MISSING_SKU:${sku}`);
  }
  console.log("[getPrice] sku =", sku);


  return {
    price_per_box_cents: entry.price_per_box_cents,
    total_amount_cents: entry.price_per_box_cents * box_count,
    price_reason: "flat_retail_v1",
  };
}
