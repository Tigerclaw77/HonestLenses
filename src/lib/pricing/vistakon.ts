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
  | "OASYS_MAX_30"
  | "OASYS_MAX_90"
  | "OASYS_MAX_AST_30"
  | "OASYS_MAX_MF_30"
  | "OASYS_MAX_MF_90"
  | "OASYS_MAX_MF_AST_30"

  // =========================
  // Acuvue Oasys 1-Day
  // =========================
  | "OASYS_1DAY_90"
  | "OASYS_1DAY_AST_30"
  | "OASYS_1DAY_AST_90"

  // =========================
  // Acuvue Oasys (Bi-weekly)
  // =========================
  | "OASYS_12"
  | "OASYS_24"
  | "OASYS_AST_6"
  | "OASYS_MF_6"

  // =========================
  // Acuvue Moist 1-Day
  // =========================
  | "MOIST_30"
  | "MOIST_90"
  | "MOIST_AST_30"
  | "MOIST_AST_90"
  | "MOIST_MF_30"
  | "MOIST_MF_90"

  // =========================
  // Acuvue Vita (Monthly)
  // =========================
  | "VITA_6"
  | "VITA_12"
  | "VITA_AST_6"

  // =========================
  // Define (1-Day, 30-pack)
  // =========================
  | "DEFINE_30";

type PriceEntry = {
  price_per_box_cents: number;
};

export const VISTAKON_PRICING: Record<VistakonSKU, PriceEntry> = {
  // =========================
  // Oasys MAX 1-Day
  // =========================
  OASYS_MAX_30: { price_per_box_cents: 4999 },
  OASYS_MAX_90: { price_per_box_cents: 10899 },
  OASYS_MAX_AST_30: { price_per_box_cents: 4500 },
  OASYS_MAX_MF_30: { price_per_box_cents: 5799 },
  OASYS_MAX_MF_90: { price_per_box_cents: 10899 },
  OASYS_MAX_MF_AST_30: { price_per_box_cents: 6499 },

  // =========================
  // Oasys 1-Day
  // =========================
  OASYS_1DAY_90: { price_per_box_cents: 9299 },
  OASYS_1DAY_AST_30: { price_per_box_cents: 5299 },
  OASYS_1DAY_AST_90: { price_per_box_cents: 10899 },

  // =========================
  // Oasys Bi-weekly
  // =========================
  OASYS_12: { price_per_box_cents: 7299 },
  OASYS_24: { price_per_box_cents: 13799 },
  OASYS_AST_6: { price_per_box_cents: 5399 },
  OASYS_MF_6: { price_per_box_cents: 5299 },

  // =========================
  // Moist 1-Day
  // =========================
  MOIST_30: { price_per_box_cents: 4499 },
  MOIST_90: { price_per_box_cents: 8499 },
  MOIST_AST_30: { price_per_box_cents: 4899 },
  MOIST_AST_90: { price_per_box_cents: 9899 },
  MOIST_MF_30: { price_per_box_cents: 5799 },
  MOIST_MF_90: { price_per_box_cents: 10999 },

  // =========================
  // Vita (Monthly)
  // =========================
  VITA_6: { price_per_box_cents: 6599 },
  VITA_12: { price_per_box_cents: 10499 },
  VITA_AST_6: { price_per_box_cents: 6999 },

  // =========================
  // Define (1-Day, -pack)
  // =========================
  DEFINE_30: { price_per_box_cents: 5499 },
};
