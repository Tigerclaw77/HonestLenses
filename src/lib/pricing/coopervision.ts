/**
 * CooperVision pricing
 *
 * RULES:
 * - Each SKU represents ONE physical box
 * - No duration / supply intent encoded in SKU
 * - No RX logic
 * - No quantity logic
 * - No pricing explanations
 * - MiSight intentionally excluded (specialty / myopia control)
 */

export type CooperVisionSKU =
  // =========================
  // Daily Disposables
  // =========================
  | "CLARITI_1DAY_30"
  | "CLARITI_1DAY_90"
  | "CLARITI_1DAY_MF_30"
  | "CLARITI_1DAY_MF_90"
  | "CLARITI_1DAY_AST_30"
  | "CLARITI_1DAY_AST_90"

  | "MYDAY_90"
  | "MYDAY_180"
  | "MYDAY_ENERGYS_90"
  | "MYDAY_AST_90"
  | "MYDAY_MF_90"

  | "PROCLEAR_1DAY_90"
  | "PROCLEAR_1DAY_MF_90"

  // =========================
  // Monthly / Biweekly
  // =========================
  | "AVAIRA_VITALITY_6"
  | "AVAIRA_VITALITY_TORIC_6"

  | "BIOFINITY_6"
  | "BIOFINITY_ENERGYS_6"
  | "BIOFINITY_XR_6"
  | "BIOFINITY_TORIC_6"
  | "BIOFINITY_XR_TORIC_6"
  | "BIOFINITY_MF_6"
  | "BIOFINITY_AST_MF_6"

  | "BIOMEDICS_55_6"
  | "BIOMEDICS_TORIC_6"

  | "PROCLEAR_6"
  | "PROCLEAR_TORIC_6"
  | "PROCLEAR_TORIC_XR_6"
  | "PROCLEAR_MF_6"
  | "PROCLEAR_MF_XR_6"
  | "PROCLEAR_MF_AST_6";

type PriceEntry = {
  price_per_box_cents: number;
};

export const COOPERVISION_PRICING: Record<CooperVisionSKU, PriceEntry> = {
  // =========================
  // Clariti 1 Day
  // =========================
  CLARITI_1DAY_30: { price_per_box_cents: 2275 },
  CLARITI_1DAY_90: { price_per_box_cents: 4775 },
  CLARITI_1DAY_MF_30: { price_per_box_cents: 3300 },
  CLARITI_1DAY_MF_90: { price_per_box_cents: 7375 },
  CLARITI_1DAY_AST_30: { price_per_box_cents: 3025 },
  CLARITI_1DAY_AST_90: { price_per_box_cents: 6700 },

  // =========================
  // MyDay
  // =========================
  MYDAY_90: { price_per_box_cents: 6275 },
  MYDAY_180: { price_per_box_cents: 11300 },
  MYDAY_ENERGYS_90: { price_per_box_cents: 7200 },
  MYDAY_AST_90: { price_per_box_cents: 8175 },
  MYDAY_MF_90: { price_per_box_cents: 9500 },

  // =========================
  // Proclear Daily
  // =========================
  PROCLEAR_1DAY_90: { price_per_box_cents: 5575 },
  PROCLEAR_1DAY_MF_90: { price_per_box_cents: 7925 },

  // =========================
  // Avaira Vitality
  // =========================
  AVAIRA_VITALITY_6: { price_per_box_cents: 2625 },
  AVAIRA_VITALITY_TORIC_6: { price_per_box_cents: 3075 },

  // =========================
  // Biofinity
  // =========================
  BIOFINITY_6: { price_per_box_cents: 3600 },
  BIOFINITY_ENERGYS_6: { price_per_box_cents: 3750 },
  BIOFINITY_XR_6: { price_per_box_cents: 3600 },
  BIOFINITY_TORIC_6: { price_per_box_cents: 4725 },
  BIOFINITY_XR_TORIC_6: { price_per_box_cents: 8950 },
  BIOFINITY_MF_6: { price_per_box_cents: 6350 },
  BIOFINITY_AST_MF_6: { price_per_box_cents: 9650 },

  // =========================
  // Biomedics
  // =========================
  BIOMEDICS_55_6: { price_per_box_cents: 3075 },
  BIOMEDICS_TORIC_6: { price_per_box_cents: 3575 },

  // =========================
  // Proclear Monthly
  // =========================
  PROCLEAR_6: { price_per_box_cents: 4450 },
  PROCLEAR_TORIC_6: { price_per_box_cents: 5550 },
  PROCLEAR_TORIC_XR_6: { price_per_box_cents: 10100 },
  PROCLEAR_MF_6: { price_per_box_cents: 6450 },
  PROCLEAR_MF_XR_6: { price_per_box_cents: 10275 },
  PROCLEAR_MF_AST_6: { price_per_box_cents: 12200 },
};