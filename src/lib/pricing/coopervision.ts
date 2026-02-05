export const COOPERVISION_PRICING = {
  BIOFINITY_6PK: {
    price_per_box_cents: 5500,
  },
  BIOFINITY_XR_6PK: {
    price_per_box_cents: 6200,
  },
} as const;

export type CoopervisionSKU = keyof typeof COOPERVISION_PRICING;
