export const BAUSCH_PRICING = {
  ULTRA_6PK: {
    price_per_box_cents: 5500,
  },
  ULTRA_FOR_ASTIGMATISM_6PK: {
    price_per_box_cents: 6200,
  },
} as const;

export type BauschSKU = keyof typeof BAUSCH_PRICING;
