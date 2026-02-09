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

export const SKU_BOX_DURATION_MONTHS: Record<string, number> = {

  // =========================
  // VISTAKON
  // =========================

  // Acuvue Oasys MAX 1-Day
  OASYS_MAX_30: 1,
  OASYS_MAX_90: 3,
  OASYS_MAX_AST_30: 1,
  OASYS_MAX_MF_30: 1,
  OASYS_MAX_MF_90: 3,
  OASYS_MAX_MF_AST_30: 1,

  // Acuvue Oasys 1-Day
  OASYS_1DAY_90: 3,
  OASYS_1DAY_AST_30: 1,
  OASYS_1DAY_AST_90: 3,

  // Acuvue Oasys
  OASYS_12: 6,
  OASYS_24: 12,
  OASYS_AST_6: 3,
  OASYS_MF_6: 3,

  // Acuvue Moist 1-Day
  MOIST_30: 1,
  MOIST_90: 3,
  MOIST_AST_30: 1,
  MOIST_AST_90: 3,
  MOIST_MF_30: 1,
  MOIST_MF_90: 3,

  // Acuvue Vita
  VITA_6: 6,
  VITA_12: 12,
  VITA_AST_6: 6,

  // Define
  DEFINE_30: 1,

  // =========================
  // ALCON
  // =========================

  // DAILIES TOTAL1
  TOTAL1_30: 1,
  TOTAL1_90: 3,
  TOTAL1_AST_30: 1,
  TOTAL1_AST_90: 3,
  TOTAL1_MF_30: 1,
  TOTAL1_MF_90: 3,

  // TOTAL30
  TOTAL30_6: 6,
  TOTAL30_AST_6: 6,
  TOTAL30_MF_6: 6,
  TOTAL30_MF_AST_6: 6,

  // Precision1
  PRECISION1_30: 1,
  PRECISION1_90: 3,
  PRECISION1_AST_30: 1,
  PRECISION1_AST_90: 3,

  // Precision7
  PRECISION7_12: 3,
  PRECISION7_27: 6,
  PRECISION7_AST_12: 3,
  PRECISION7_AST_27: 6,

  // Air Optix
  AIR_OPTIX_6: 6,
  AIR_OPTIX_AST_6: 6,
  AIR_OPTIX_MF_6: 6,
  AIR_OPTIX_NIGHT_AND_DAY_6: 6,
  AIR_OPTIX_COLORS_2: 2,
  AIR_OPTIX_COLORS_6: 6,

  // AquaComfort Plus
  AQUACOMFORT_PLUS_30: 1,
  AQUACOMFORT_PLUS_90: 3,
  AQUACOMFORT_PLUS_AST_30: 1,
  AQUACOMFORT_PLUS_AST_90: 3,
  AQUACOMFORT_PLUS_MF_30: 1,
  AQUACOMFORT_PLUS_MF_90: 3,

  // Dailes Colors
  DAILIES_COLORS_30: 1,
  DAILIES_COLORS_90: 3,

  // =========================
  // Bausch + Lomb
  // =========================

  // ULTRA_6PK: 6,
  // ULTRA_FOR_ASTIGMATISM_6PK: 6,
};
