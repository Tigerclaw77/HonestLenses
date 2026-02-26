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

export type BauschSKU =
  // =========================
  // INFUSE (Daily)
  // =========================
  | "INFUSE_90"
  | "INFUSE_AST_90"
  | "INFUSE_MF_90"

  // =========================
  // Biotrue ONEday (Daily)
  // =========================
  | "BIOTRUE_ONEDAY_30"
  | "BIOTRUE_ONEDAY_90"
  | "BIOTRUE_ONEDAY_AST_30"
  | "BIOTRUE_ONEDAY_AST_90"
  | "BIOTRUE_ONEDAY_MF_30"
  | "BIOTRUE_ONEDAY_MF_90"

  // =========================
  // ULTRA (Monthly, 6-pack)
  // =========================
  | "ULTRA_6"
  | "ULTRA_AST_6"
  | "ULTRA_MF_6"
  | "ULTRA_AST_MF_6"

  // =========================
  // PureVision 2 (Monthly, 6-pack)
  // =========================
  | "PUREVISION2_6"
  | "PUREVISION2_AST_6"
  | "PUREVISION2_MF_6"

  // =========================
  // PureVision (Monthly, 6-pack)
  // =========================
  | "PUREVISION_6"
  | "PUREVISION_MF_6"

  // =========================
  // SofLens (various)
  // =========================
  | "SOFLENS_DAILY_DISPOSABLE_90"
  | "SOFLENS_6"
  | "SOFLENS_AST_6"
  | "SOFLENS_MF_6"
  
type PriceEntry = {
  price_per_box_cents: number;
};

export const BAUSCH_PRICING: Record<BauschSKU, PriceEntry> = {
  // =========================
  // INFUSE (Daily)
  // =========================
  INFUSE_90: { price_per_box_cents: 9299 },
  INFUSE_AST_90: { price_per_box_cents: 11299 },
  INFUSE_MF_90: { price_per_box_cents: 12799 },

  // =========================
  // Biotrue ONEday (Daily)
  // =========================
  BIOTRUE_ONEDAY_30: { price_per_box_cents: 3199 },
  BIOTRUE_ONEDAY_90: { price_per_box_cents: 6499 },
  BIOTRUE_ONEDAY_AST_30: { price_per_box_cents: 4099 },
  BIOTRUE_ONEDAY_AST_90: { price_per_box_cents: 7999 },
  BIOTRUE_ONEDAY_MF_30: { price_per_box_cents: 4199 },
  BIOTRUE_ONEDAY_MF_90: { price_per_box_cents: 8999 },

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
  // SofLens (various)
  // =========================
  SOFLENS_DAILY_DISPOSABLE_90: { price_per_box_cents: 5750 },
  SOFLENS_6: { price_per_box_cents: 2825 },
  SOFLENS_AST_6: { price_per_box_cents: 4375 },
  SOFLENS_MF_6: { price_per_box_cents: 6675 },
};
