// src/lib/pricing/bausch.ts

/**
 * Bausch + Lomb pricing
 *
 * RULES:
 * - Each SKU represents ONE physical box
 * - No duration / supply intent encoded in SKU
 * - No RX logic
 * - No quantity logic
 * - No pricing explanations
 *
 * Pricing source: "Bausch + Lomb National List Price" (effective Feb 1, 2026)
 */

type PriceEntry = {
  price_per_box_cents: number;
};

export const BAUSCH_PRICING = {
  // =========================
  // INFUSE (Daily)
  // =========================
  INFUSE_1D_90: { price_per_box_cents: 9299 },
  INFUSE_1D_AST_90: { price_per_box_cents: 11299 },
  INFUSE_1D_MF_90: { price_per_box_cents: 12799 },

  // =========================
  // Biotrue ONEday (Daily)
  // =========================
  BIOTRUE_1D_30: { price_per_box_cents: 3199 },
  BIOTRUE_1D_90: { price_per_box_cents: 6499 },
  BIOTRUE_1D_AST_30: { price_per_box_cents: 4099 },
  BIOTRUE_1D_AST_90: { price_per_box_cents: 7999 },
  BIOTRUE_1D_MF_30: { price_per_box_cents: 4199 },
  BIOTRUE_1D_MF_90: { price_per_box_cents: 8999 },

  // =========================
  // ULTRA (Monthly, 6-pack)
  // =========================
  ULTRA_6: { price_per_box_cents: 5550 },
  ULTRA_AST_6: { price_per_box_cents: 7850 },
  ULTRA_MF_6: { price_per_box_cents: 8025 },
  ULTRA_AST_MF_6: { price_per_box_cents: 10675 },

  // =========================
  // PureVision 2 (Monthly, 6-pack)
  // =========================
  PUREVISION2_6: { price_per_box_cents: 6675 },
  PUREVISION2_AST_6: { price_per_box_cents: 6725 }, // PureVision 2 For Astigmatism
  PUREVISION2_MF_6: { price_per_box_cents: 7550 }, // PureVision 2 For Presbyopia

  // =========================
  // PureVision (Monthly, 6-pack)
  // =========================
  PUREVISION_6: { price_per_box_cents: 8075 },
  PUREVISION_MF_6: { price_per_box_cents: 8750 },

  // =========================
  // SofLens
  // =========================
  SOFLENS_DAILY_90: { price_per_box_cents: 5750 },
  SOFLENS38_6: { price_per_box_cents: 2825 },
  SOFLENS_AST_6: { price_per_box_cents: 4375 },
  SOFLENS_MF_6: { price_per_box_cents: 6675 },
} as const satisfies Record<string, PriceEntry>;

/**
 * Automatically derived SKU type
 */
export type BauschSKU = keyof typeof BAUSCH_PRICING;

/**
 * Alias for consistency with other pricing files
 */
export type BauschPricingKey = BauschSKU;