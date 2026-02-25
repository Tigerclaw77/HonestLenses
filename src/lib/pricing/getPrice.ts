// src/lib/pricing/getPrice.ts

import { VISTAKON_PRICING } from "./vistakon"
import { BAUSCH_PRICING } from "./bausch"
import { COOPERVISION_PRICING } from "./coopervision"
import { ALCON_PRICING } from "./alcon"

export type Manufacturer =
  | "vistakon"
  | "bausch"
  | "coopervision"
  | "alcon"

type GetPriceInput = {
  sku: string
  box_count: number
}

export type PriceResult = {
  manufacturer: Manufacturer
  price_per_box_cents: number
  total_amount_cents: number
  price_reason: string
}

type PricingLookupResult = {
  manufacturer: Manufacturer
  entry: {
    price_per_box_cents: number
  }
} | null

function lookupPricing(sku: string): PricingLookupResult {
  if (sku in VISTAKON_PRICING) {
    return {
      manufacturer: "vistakon",
      entry: VISTAKON_PRICING[
        sku as keyof typeof VISTAKON_PRICING
      ],
    }
  }

  if (sku in BAUSCH_PRICING) {
    return {
      manufacturer: "bausch",
      entry: BAUSCH_PRICING[
        sku as keyof typeof BAUSCH_PRICING
      ],
    }
  }

  if (sku in COOPERVISION_PRICING) {
    return {
      manufacturer: "coopervision",
      entry: COOPERVISION_PRICING[
        sku as keyof typeof COOPERVISION_PRICING
      ],
    }
  }

  if (sku in ALCON_PRICING) {
    return {
      manufacturer: "alcon",
      entry: ALCON_PRICING[
        sku as keyof typeof ALCON_PRICING
      ],
    }
  }

  return null
}

export function getPrice({
  sku,
  box_count,
}: GetPriceInput): PriceResult {
  const result = lookupPricing(sku)

  if (!result) {
    throw new Error(`PRICING_V1_MISSING_SKU:${sku}`)
  }

  const { manufacturer, entry } = result

  return {
    manufacturer,
    price_per_box_cents: entry.price_per_box_cents,
    total_amount_cents:
      entry.price_per_box_cents * box_count,
    price_reason: "flat_retail_v1",
  }
}