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

  // =========================
  // Precision1
  // =========================
  | "PRECISION1_30"
  | "PRECISION1_90"
  | "PRECISION1_AST_30"
  | "PRECISION1_AST_90"

  // =========================
  // Air Optix
  // =========================
  | "AIR_OPTIX_6"
  | "AIR_OPTIX_AST_6"
  | "AIR_OPTIX_MF_6";

type PriceEntry = {
  price_per_box_cents: number;
};

export const ALCON_PRICING: Record<AlconSKU, PriceEntry> = {
  // =========================
  // DAILIES TOTAL1
  // =========================
  TOTAL1_30: { price_per_box_cents: 4200 },
  TOTAL1_90: { price_per_box_cents: 9800 },
  TOTAL1_AST_30: { price_per_box_cents: 5200 },
  TOTAL1_AST_90: { price_per_box_cents: 13200 },
  TOTAL1_MF_30: { price_per_box_cents: 6500 },
  TOTAL1_MF_90: { price_per_box_cents: 14800 },

  // =========================
  // TOTAL30 (Monthly, 6-pack)
  // =========================
  TOTAL30_6: { price_per_box_cents: 8800 },
  TOTAL30_AST_6: { price_per_box_cents: 9500 },
  TOTAL30_MF_6: { price_per_box_cents: 9800 },

  // =========================
  // Precision1
  // =========================
  PRECISION1_30: { price_per_box_cents: 3600 },
  PRECISION1_90: { price_per_box_cents: 8200 },
  PRECISION1_AST_30: { price_per_box_cents: 4800 },
  PRECISION1_AST_90: { price_per_box_cents: 11800 },

  // =========================
  // Air Optix
  // =========================
  AIR_OPTIX_6: { price_per_box_cents: 6200 },
  AIR_OPTIX_AST_6: { price_per_box_cents: 7000 },
  AIR_OPTIX_MF_6: { price_per_box_cents: 7200 },
};

export type AlconPricingKey = keyof typeof ALCON_PRICING;
