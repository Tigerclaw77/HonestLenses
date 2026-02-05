export const ALCON_PRICING = {
  TOTAL30_6PK: {
    price_per_box_cents: 5500,
  },
  TOTAL30_FOR_ASTIGMATISM_6PK: {
    price_per_box_cents: 6200,
  },
} as const;

export type AlconSKU = keyof typeof ALCON_PRICING;
