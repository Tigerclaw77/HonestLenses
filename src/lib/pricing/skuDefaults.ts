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
  OASYS_MAX_AST_MF_30: 1,

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

  //Acuvue 2
  ACUVUE2_6: 3,

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
  TOTAL30_AST_MF_6: 6,

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

  //Infuse
  INFUSE_90: 3,
  INFUSE_AST_90: 3,
  INFUSE_MF_90: 3,

  //Biotrue
  BIOTRUE_ONEDAY_30: 1,
  BIOTRUE_ONEDAY_90: 3,
  BIOTRUE_ONEDAY_AST_30: 1,
  BIOTRUE_ONEDAY_AST_90: 3,
  BIOTRUE_ONEDAY_MF_30: 1,
  BIOTRUE_ONEDAY_MF_90: 3,

  //Ultra
  ULTRA_6: 6,
  ULTRA_AST_6: 6,
  ULTRA_MF_6: 6,
  ULTRA_MF_AST_6: 6,

  //PureVision
  PUREVISION_6: 6,
  PUREVISION_MF_6: 6,
  PUREVISION2_6: 6,
  PUREVISION2_AST_6: 6,
  PUREVISION2_MF_6: 6,

  //SofLens
  SOFLENS_DAILY_DISPOSABLE_90: 3,
  SOFLENS_6: 3,
  SOFLENS_AST_6: 3,
  SOFLENS_MF_6: 3,


// =========================
// CooperVision
// =========================

  //clariti
  CLARITI_1DAY_30: 1,
  CLARITI_1DAY_90: 3,
  CLARITI_1DAY_MF_30: 1,
  CLARITI_1DAY_MF_90: 3,
  CLARITI_1DAY_AST_30: 1,
  CLARITI_1DAY_AST_90: 3,

  //MyDay
  MYDAY_90: 3,
  MYDAY_180: 6,
  MYDAY_ENERGYS_90: 3,
  MYDAY_AST_90: 3,
  MYDAY_MF_90: 3,

  //Proclear
  PROCLEAR_1DAY_90: 3,
  PROCLEAR_1DAY_MF_90: 3,
  PROCLEAR_6: 6,
  PROCLEAR_AST_6: 6,
  PROCLEAR_XR_AST_6: 6,
  PROCLEAR_AST_MF_6: 3,
  PROCLEAR_MF_6: 6,
  PROCLEAR_XR_MF_6: 6,

  //Avaira
  AVAIRA_VITALITY_6: 3,
  AVAIRA_VITALITY_AST_6: 3,

  //Biofinity
  BIOFINITY_6: 6,
  BIOFINITY_XR_6: 6,
  BIOFINITY_ENERGYS_6: 6,
  BIOFINITY_MF_6: 6,
  BIOFINITY_AST_6: 6,
  BIOFINITY_XR_AST_6: 6,
  BIOFINITY_AST_MF_6: 6,

  //Biomedics
  BIOMEDICS_55_6: 3,
  BIOMEDICS_AST_6: 3,


};