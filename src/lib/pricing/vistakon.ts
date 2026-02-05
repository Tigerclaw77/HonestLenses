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

export type VistakonSKU =
  // =========================
  // Acuvue Oasys MAX 1-Day
  // =========================
  | "OASYS_MAX_1DAY_30"
  | "OASYS_MAX_1DAY_90"
  | "OASYS_MAX_1DAY_AST_30"
  | "OASYS_MAX_1DAY_MF_30"
  | "OASYS_MAX_1DAY_MF_90"
  | "OASYS_MAX_1DAY_MF_AST_30"

  // =========================
  // Acuvue Oasys 1-Day
  // =========================
  | "OASYS_1DAY_90"
  | "OASYS_1DAY_AST_30"
  | "OASYS_1DAY_AST_90"

  // =========================
  // Acuvue Oasys (Bi-weekly)
  // =========================
  | "OASYS_2WK_6"
  | "OASYS_2WK_AST_6"
  | "OASYS_2WK_MF_6"

  // =========================
  // Acuvue Moist 1-Day
  // =========================
  | "MOIST_1DAY_30"
  | "MOIST_1DAY_90"
  | "MOIST_1DAY_AST_30"
  | "MOIST_1DAY_AST_90"
  | "MOIST_1DAY_MF_30"
  | "MOIST_1DAY_MF_90"

  // =========================
  // Acuvue Vita (Monthly)
  // =========================
  | "VITA_6"
  | "VITA_AST_6";

type PriceEntry = {
  price_per_box_cents: number;
};

export const VISTAKON_PRICING: Record<VistakonSKU, PriceEntry> = {
  // =========================
  // Oasys MAX 1-Day
  // =========================
  OASYS_MAX_1DAY_30: { price_per_box_cents: 5200 },
  OASYS_MAX_1DAY_90: { price_per_box_cents: 11400 },
  OASYS_MAX_1DAY_AST_30: { price_per_box_cents: 4500 },
  OASYS_MAX_1DAY_MF_30: { price_per_box_cents: 6900 },
  OASYS_MAX_1DAY_MF_90: { price_per_box_cents: 15400 },
  OASYS_MAX_1DAY_MF_AST_30: { price_per_box_cents: 5600 },

  // =========================
  // Oasys 1-Day
  // =========================
  OASYS_1DAY_90: { price_per_box_cents: 10200 },
  OASYS_1DAY_AST_30: { price_per_box_cents: 5400 },
  OASYS_1DAY_AST_90: { price_per_box_cents: 12200 },

  // =========================
  // Oasys Bi-weekly (6-pack)
  // =========================
  OASYS_2WK_6: { price_per_box_cents: 4900 },
  OASYS_2WK_AST_6: { price_per_box_cents: 5500 },
  OASYS_2WK_MF_6: { price_per_box_cents: 5600 },

  // =========================
  // Moist 1-Day
  // =========================
  MOIST_1DAY_30: { price_per_box_cents: 4500 },
  MOIST_1DAY_90: { price_per_box_cents: 8200 },
  MOIST_1DAY_AST_30: { price_per_box_cents: 4900 },
  MOIST_1DAY_AST_90: { price_per_box_cents: 10600 },
  MOIST_1DAY_MF_30: { price_per_box_cents: 6500 },
  MOIST_1DAY_MF_90: { price_per_box_cents: 12100 },

  // =========================
  // Vita (Monthly, 6-pack)
  // =========================
  VITA_6: { price_per_box_cents: 7800 },
  VITA_AST_6: { price_per_box_cents: 8200 },
};
