import { getSkuBoxDurationMonths } from "./skuDefaults";

export const CORE_TO_SKUS: Record<string, string[]> = {
  // =========================
  // VISTAKON
  // =========================

  OASYS_MAX_1D: ["OASYS_MAX_30", "OASYS_MAX_90"],
  OASYS_MAX_1D_AST: ["OASYS_MAX_AST_30"],
  OASYS_MAX_1D_MF: ["OASYS_MAX_MF_30", "OASYS_MAX_MF_90"],
  OASYS_MAX_1D_AST_MF: ["OASYS_MAX_AST_MF_30"],

  OASYS_1D: ["OASYS_1D_90"],
  OASYS_1D_AST: ["OASYS_1D_AST_30", "OASYS_1D_AST_90"],

  OASYS_2W: ["OASYS_12", "OASYS_24"],
  OASYS_2W_AST: ["OASYS_AST_6"],
  OASYS_2W_MF: ["OASYS_MF_6"],

  MOIST: ["MOIST_30", "MOIST_90"],
  MOIST_AST: ["MOIST_AST_30", "MOIST_AST_90"],
  MOIST_MF: ["MOIST_MF_30", "MOIST_MF_90"],

  VITA: ["VITA_6", "VITA_12"],
  VITA_AST: ["VITA_AST_6"],

  DEFINE: ["DEFINE_30"],
  ACUVUE2: ["ACUVUE2_6"],

  // =========================
  // ALCON
  // =========================

  DT1: ["DT1_30", "DT1_90"],
  DT1_AST: ["DT1_AST_30", "DT1_AST_90"],
  DT1_MF: ["DT1_MF_30", "DT1_MF_90"],

  TOTAL30: ["TOTAL30_6"],
  TOTAL30_AST: ["TOTAL30_AST_6"],
  TOTAL30_MF: ["TOTAL30_MF_6"],
  TOTAL30_AST_MF: ["TOTAL30_AST_MF_6"],

  PRECISION1: ["PRECISION1_30", "PRECISION1_90"],
  PRECISION1_AST: ["PRECISION1_AST_30", "PRECISION1_AST_90"],

  PRECISION7: ["PRECISION7_12", "PRECISION7_27"],
  PRECISION7_AST: ["PRECISION7_AST_12", "PRECISION7_AST_27"],

  AO_HG: ["AO_HG_6"],
  AO_HG_AST: ["AO_HG_AST_6"],
  AO_HG_MF: ["AO_HG_MF_6"],
  AO_ND: ["AO_ND_6"],
  AO_COL: ["AO_COL_2", "AO_COL_6"],

  DACP: ["DACP_30", "DACP_90"],
  DACP_AST: ["DACP_AST_30", "DACP_AST_90"],
  DACP_MF: ["DACP_MF_30", "DACP_MF_90"],

  DAILIES_COL: ["DAILIES_COL_30", "DAILIES_COL_90"],

  // =========================
  // BAUSCH + LOMB
  // =========================

  INFUSE_1D: ["INFUSE_1D_90"],
  INFUSE_1D_AST: ["INFUSE_1D_AST_90"],
  INFUSE_1D_MF: ["INFUSE_1D_MF_90"],

  BIOTRUE_1D: ["BIOTRUE_1D_30", "BIOTRUE_1D_90"],
  BIOTRUE_1D_AST: ["BIOTRUE_1D_AST_30", "BIOTRUE_1D_AST_90"],
  BIOTRUE_1D_MF: ["BIOTRUE_1D_MF_30", "BIOTRUE_1D_MF_90"],

  ULTRA: ["ULTRA_6"],
  ULTRA_AST: ["ULTRA_AST_6"],
  ULTRA_MF: ["ULTRA_MF_6"],
  ULTRA_AST_MF: ["ULTRA_AST_MF_6"],

  PUREVISION: ["PUREVISION_6"],
  PUREVISION_MF: ["PUREVISION_MF_6"],
  PUREVISION2: ["PUREVISION2_6"],
  PUREVISION2_AST: ["PUREVISION2_AST_6"],
  PUREVISION2_MF: ["PUREVISION2_MF_6"],

  SOFLENS_DAILY: ["SOFLENS_DAILY_90"],
  SOFLENS38: ["SOFLENS38_6"],
  SOFLENS_AST: ["SOFLENS_AST_6"],
  SOFLENS_MF: ["SOFLENS_MF_6"],

  // =========================
  // COOPERVISION
  // =========================

  CLARITI_1D: ["CLARITI_1D_30", "CLARITI_1D_90"],
  CLARITI_1D_AST: ["CLARITI_1D_AST_30", "CLARITI_1D_AST_90"],  
  CLARITI_1D_MF: ["CLARITI_1D_MF_30", "CLARITI_1D_MF_90"],

  MYDAY: ["MYDAY_90", "MYDAY_180"],
  MYDAY_ENG: ["MYDAY_ENG_90"],
  MYDAY_AST: ["MYDAY_AST_90"],
  MYDAY_MF: ["MYDAY_MF_90"],

  PROCLEAR_1D: ["PROCLEAR_1D_90"],
  PROCLEAR_1D_MF: ["PROCLEAR_1D_MF_90"],

  PROCLEAR: ["PROCLEAR_6"],
  PROCLEAR_AST: ["PROCLEAR_AST_6"],
  PROCLEAR_XR_AST: ["PROCLEAR_XR_AST_6"],
  PROCLEAR_AST_MF: ["PROCLEAR_AST_MF_6"],
  PROCLEAR_MF: ["PROCLEAR_MF_6"],
  PROCLEAR_XR_MF: ["PROCLEAR_XR_MF_6"],

  AVAIRA_VIT: ["AVAIRA_VIT_6"],
  AVAIRA_VIT_AST: ["AVAIRA_VIT_AST_6"],

  BIOFINITY: ["BIOFINITY_6"],
  BIOFINITY_XR: ["BIOFINITY_XR_6"],
  BIOFINITY_ENG: ["BIOFINITY_ENG_6"],
  BIOFINITY_MF: ["BIOFINITY_MF_6"],
  BIOFINITY_AST: ["BIOFINITY_AST_6"],
  BIOFINITY_XR_AST: ["BIOFINITY_XR_AST_6"],
  BIOFINITY_AST_MF: ["BIOFINITY_AST_MF_6"],

  BIOMEDICS: ["BIOMEDICS_6"],
  BIOMEDICS_AST: ["BIOMEDICS_AST_6"],
};

export function resolveDefaultSku(
  coreId: string,
  targetMonths: 6 | 12 = 12,
): string | null {
  const skus = CORE_TO_SKUS[coreId];
  if (!skus || skus.length === 0) return null;

  // sort by duration descending (largest first)
  const sorted = [...skus].sort(
    (a, b) => getSkuBoxDurationMonths(b) - getSkuBoxDurationMonths(a),
  );

  if (targetMonths === 12) {
    return sorted[0];
  }

  // for 6 months, choose the largest box that does not exceed 6 months
  return sorted.find((sku) => getSkuBoxDurationMonths(sku) <= 6) ?? sorted[0];
}
