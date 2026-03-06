// src/lib/pricing/vistakon.ts

/**
 * Vistakon / Johnson & Johnson pricing
 *
 * RULES:
 * - Each SKU represents ONE physical box
 * - No duration / supply intent encoded in SKU
 * - No RX logic
 * - No quantity logic
 * - No pricing explanations
 */

type PriceEntry = {
  price_per_box_cents: number;
};

export const VISTAKON_PRICING = {
  // =========================
  // Acuvue Oasys MAX 1-Day
  // =========================
  OASYS_MAX_1D_30: { price_per_box_cents: 4699 },
  OASYS_MAX_1D_90: { price_per_box_cents: 10399 },
  OASYS_MAX_1D_AST_30: { price_per_box_cents: 5199 },
  OASYS_MAX_1D_MF_30: { price_per_box_cents: 5899 },
  OASYS_MAX_1D_MF_90: { price_per_box_cents: 12999 },
  OASYS_MAX_1D_AST_MF_30: { price_per_box_cents: 6499 },

  // =========================
  // Acuvue Oasys 1-Day
  // =========================
  OASYS_1D_90: { price_per_box_cents: 9299 },
  OASYS_1D_AST_30: { price_per_box_cents: 5299 },
  OASYS_1D_AST_90: { price_per_box_cents: 10899 },

  // =========================
  // Acuvue Oasys (Bi-weekly)
  // =========================
  OASYS_2W_12: { price_per_box_cents: 7299 },
  OASYS_2W_24: { price_per_box_cents: 13799 },
  OASYS_2W_AST_6: { price_per_box_cents: 5399 },
  OASYS_2W_MF_6: { price_per_box_cents: 5299 },

  // =========================
  // Acuvue Moist 1-Day
  // =========================
  MOIST_30: { price_per_box_cents: 4499 },
  MOIST_90: { price_per_box_cents: 8499 },
  MOIST_AST_30: { price_per_box_cents: 4899 },
  MOIST_AST_90: { price_per_box_cents: 9899 },
  MOIST_MF_30: { price_per_box_cents: 5799 },
  MOIST_MF_90: { price_per_box_cents: 10999 },

  // =========================
  // Acuvue Vita (Monthly)
  // =========================
  VITA_6: { price_per_box_cents: 6599 },
  VITA_12: { price_per_box_cents: 10499 },
  VITA_AST_6: { price_per_box_cents: 6999 },

  // =========================
  // Define (1-Day, 30-pack)
  // =========================
  DEFINE_30: { price_per_box_cents: 5499 },

  // =========================
  // Acuvue 2 (Bi-weekly)
  // =========================
  ACUVUE2_6: { price_per_box_cents: 4499 },
} as const satisfies Record<string, PriceEntry>;

/**
 * Automatically derived SKU type
 */
export type VistakonSKU = keyof typeof VISTAKON_PRICING;

/**
 * Alias for consistency with other pricing modules
 */
export type VistakonPricingKey = VistakonSKU;