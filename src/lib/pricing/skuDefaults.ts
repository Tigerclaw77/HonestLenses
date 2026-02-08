// src/lib/pricing/skuDefaults.ts

/**
 * How many MONTHS one physical box lasts.
 *
 * RULES:
 * - SKU represents ONE box
 * - Duration is approximate / rounded (industry standard)
 * - Used ONLY to calculate default quantities
 * - No RX logic
 * - No pricing logic
 */

/**
 * Vistakon / Johnson & Johnson
 */
export const SKU_BOX_DURATION_MONTHS: Record<string, number> = {
  // =========================
  // Acuvue Oasys MAX 1-Day
  // =========================
  OASYS_MAX_30: 1,
  OASYS_MAX_90: 3,
  OASYS_MAX_AST_30: 1,
  OASYS_MAX_MF_30: 1,
  OASYS_MAX_MF_90: 3,
  OASYS_MAX_MF_AST_30: 1,

  // =========================
  // Acuvue Oasys 1-Day
  // =========================

  OASYS_1DAY_90: 3,
  OASYS_1DAY_AST_30: 1,
  OASYS_1DAY_AST_90: 3,

  // =========================
  // Acuvue Oasys (Bi-weekly)
  // =========================

  OASYS_12: 6,
  OASYS_24: 12,
  OASYS_AST_6: 3,
  OASYS_MF_6: 3,

  // =========================
  // Acuvue Moist 1-Day
  // =========================

  MOIST_30: 1,
  MOIST_90: 3,
  MOIST_AST_30: 1,
  MOIST_AST_90: 3,
  MOIST_MF_30: 1,
  MOIST_MF_90: 3,

  // =========================
  // Acuvue Vita (Monthly)
  // =========================
  VITA_6: 6,
  VITA_12: 12,
  VITA_AST_6: 6,

  // =========================
  // Define (1-Day, 30-pack)
  // =========================
  DEFINE_30: 1,

  // =========================
  // Bausch + Lomb
  // =========================

  ULTRA_6PK: 6,
  ULTRA_FOR_ASTIGMATISM_6PK: 6,
};
