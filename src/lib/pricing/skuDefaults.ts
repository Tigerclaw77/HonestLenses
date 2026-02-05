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

  // 30 daily lenses ≈ 1 month
  OASYS_MAX_1DAY_30: 1,

  // 90 daily lenses ≈ 3 months
  OASYS_MAX_1DAY_90: 3,

  // Toric / MF variants follow same wear schedule
  OASYS_MAX_1DAY_AST_30: 1,
  OASYS_MAX_1DAY_MF_30: 1,
  OASYS_MAX_1DAY_MF_90: 3,
  OASYS_MAX_1DAY_MF_AST_30: 1,

  // =========================
  // Acuvue Oasys 1-Day
  // =========================

  OASYS_1DAY_90: 3,
  OASYS_1DAY_AST_30: 1,
  OASYS_1DAY_AST_90: 3,

  // =========================
  // Acuvue Oasys (Bi-weekly)
  // =========================

  // 6 lenses × 14 days ≈ 84 days ≈ 3 months
  OASYS_2WK_6: 3,
  OASYS_2WK_AST_6: 3,
  OASYS_2WK_MF_6: 3,

  // =========================
  // Acuvue Moist 1-Day
  // =========================

  MOIST_1DAY_30: 1,
  MOIST_1DAY_90: 3,
  MOIST_1DAY_AST_30: 1,
  MOIST_1DAY_AST_90: 3,
  MOIST_1DAY_MF_30: 1,
  MOIST_1DAY_MF_90: 3,

  // =========================
  // Acuvue Vita (Monthly)
  // =========================

  // 6 monthly lenses = 6 months
  VITA_6: 6,
  VITA_AST_6: 6,

  // =========================
  // Bausch + Lomb
  // =========================

  ULTRA_6PK: 6,
  ULTRA_FOR_ASTIGMATISM_6PK: 6,
};
