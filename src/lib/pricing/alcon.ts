/**
 * Alcon pricing
 *
 * RULES:
 * - Each SKU represents ONE physical box
 * - No duration / supply intent encoded in SKU
 * - No RX logic
 * - No quantity logic
 * - No pricing explanations
 */

export type AlconSKU =
  // =========================
  // DAILIES TOTAL1
  // =========================
  | "TOTAL1_30"
  | "TOTAL1_90"
  | "TOTAL1_AST_30"
  | "TOTAL1_AST_90"
  | "TOTAL1_MF_30"
  | "TOTAL1_MF_90"

  // =========================
  // TOTAL30 (Monthly)
  // =========================
  | "TOTAL30_6"
  | "TOTAL30_AST_6"
  | "TOTAL30_MF_6"
  | "TOTAL30_AST_MF_6"

  // =========================
  // Precision1
  // =========================
  | "PRECISION1_30"
  | "PRECISION1_90"
  | "PRECISION1_AST_30"
  | "PRECISION1_AST_90"

  // =========================
  // Precision7
  // =========================
  | "PRECISION7_12"
  | "PRECISION7_27"
  | "PRECISION7_AST_12"
  | "PRECISION7_AST_27"

  // =========================
  // Air Optix
  // =========================
  | "AIR_OPTIX_6"
  | "AIR_OPTIX_AST_6"
  | "AIR_OPTIX_MF_6"
  | "AIR_OPTIX_NIGHT_AND_DAY_6"
  | "AIR_OPTIX_COLORS_2"
  | "AIR_OPTIX_COLORS_6"

  // =========================
  // AquaComfort Plus
  // =========================
  | "AQUACOMFORT_PLUS_30"
  | "AQUACOMFORT_PLUS_90"
  | "AQUACOMFORT_PLUS_AST_30"
  | "AQUACOMFORT_PLUS_AST_90"
  | "AQUACOMFORT_PLUS_MF_30"
  | "AQUACOMFORT_PLUS_MF_90"

  // =========================
  // Dailes Colors
  // =========================
  | "DAILIES_COLORS_30"
  | "DAILIES_COLORS_90"

type PriceEntry = {
  price_per_box_cents: number;
};

export const ALCON_PRICING: Record<AlconSKU, PriceEntry> = {
  // =========================
  // DAILIES TOTAL1
  // =========================
  TOTAL1_30: { price_per_box_cents: 4199 },
  TOTAL1_90: { price_per_box_cents: 9999 },
  TOTAL1_AST_30: { price_per_box_cents: 4899 },
  TOTAL1_AST_90: { price_per_box_cents: 11899 },
  TOTAL1_MF_30: { price_per_box_cents: 5599 },
  TOTAL1_MF_90: { price_per_box_cents: 12899 },

  // =========================
  // TOTAL30 (Monthly, 6-pack)
  // =========================
  TOTAL30_6: { price_per_box_cents: 6599 },
  TOTAL30_AST_6: { price_per_box_cents: 6999 },
  TOTAL30_MF_6: { price_per_box_cents: 9499 },
  TOTAL30_AST_MF_6: { price_per_box_cents: 14999 },

  // =========================
  // Precision1
  // =========================
  PRECISION1_30: { price_per_box_cents: 3099 },
  PRECISION1_90: { price_per_box_cents: 6999 },
  PRECISION1_AST_30: { price_per_box_cents: 3999 },
  PRECISION1_AST_90: { price_per_box_cents: 8999 },

   // =========================
  // Precision7
  // =========================
  PRECISION7_12: { price_per_box_cents: 5299 },
  PRECISION7_27: { price_per_box_cents: 8999 },
  PRECISION7_AST_12: { price_per_box_cents: 6499 },
  PRECISION7_AST_27: { price_per_box_cents: 10899 },

  // =========================
  // Air Optix
  // =========================
  AIR_OPTIX_6: { price_per_box_cents: 5999 },
  AIR_OPTIX_AST_6: { price_per_box_cents: 7699 },
  AIR_OPTIX_MF_6: { price_per_box_cents: 9999 },
  AIR_OPTIX_NIGHT_AND_DAY_6: { price_per_box_cents: 10399 },
  AIR_OPTIX_COLORS_2: { price_per_box_cents: 4599 },
  AIR_OPTIX_COLORS_6: { price_per_box_cents: 10899 },

   // =========================
  // AquaComfort Plus
  // =========================
  AQUACOMFORT_PLUS_30: { price_per_box_cents: 2999 },
  AQUACOMFORT_PLUS_90: { price_per_box_cents: 7599 },
  AQUACOMFORT_PLUS_AST_30: { price_per_box_cents: 3699 },
  AQUACOMFORT_PLUS_AST_90: { price_per_box_cents: 9599 },
  AQUACOMFORT_PLUS_MF_30: { price_per_box_cents: 4799 },
  AQUACOMFORT_PLUS_MF_90: { price_per_box_cents: 11299 },

  // =========================
  // Dailes Colors
  // =========================
  DAILIES_COLORS_30: { price_per_box_cents: 3799 },
  DAILIES_COLORS_90: { price_per_box_cents: 7799 },
};

export type AlconPricingKey = keyof typeof ALCON_PRICING;
