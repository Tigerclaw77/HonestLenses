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

type PriceEntry = {
  price_per_box_cents: number;
};

export const COOPERVISION_PRICING = {
  // =========================
  // Clariti 1 Day
  // =========================
  CLARITI_1D_30: { price_per_box_cents: 2275 },
  CLARITI_1D_90: { price_per_box_cents: 4775 },
  CLARITI_1D_MF_30: { price_per_box_cents: 3300 },
  CLARITI_1D_MF_90: { price_per_box_cents: 7375 },
  CLARITI_1D_AST_30: { price_per_box_cents: 3025 },
  CLARITI_1D_AST_90: { price_per_box_cents: 6700 },

  // =========================
  // MyDay
  // =========================
  MYDAY_90: { price_per_box_cents: 6275 },
  MYDAY_180: { price_per_box_cents: 11300 },
  MYDAY_ENG_90: { price_per_box_cents: 7200 },
  MYDAY_AST_90: { price_per_box_cents: 8175 },
  MYDAY_MF_90: { price_per_box_cents: 9500 },

  // =========================
  // Proclear Daily
  // =========================
  PROCLEAR_1D_90: { price_per_box_cents: 5575 },
  PROCLEAR_1D_MF_90: { price_per_box_cents: 7925 },

  // =========================
  // Avaira Vitality
  // =========================
  AVAIRA_VIT_6: { price_per_box_cents: 2625 },
  AVAIRA_VIT_AST_6: { price_per_box_cents: 3075 },

  // =========================
  // Biofinity
  // =========================
  BIOFINITY_6: { price_per_box_cents: 3600 },
  BIOFINITY_ENG_6: { price_per_box_cents: 3750 },
  BIOFINITY_XR_6: { price_per_box_cents: 3600 },
  BIOFINITY_AST_6: { price_per_box_cents: 4725 },
  BIOFINITY_XR_AST_6: { price_per_box_cents: 8950 },
  BIOFINITY_MF_6: { price_per_box_cents: 6350 },
  BIOFINITY_AST_MF_6: { price_per_box_cents: 9650 },

  // =========================
  // Biomedics
  // =========================
  BIOMEDICS_6: { price_per_box_cents: 3075 },
  BIOMEDICS_AST_6: { price_per_box_cents: 3575 },

  // =========================
  // Proclear Monthly
  // =========================
  PROCLEAR_6: { price_per_box_cents: 4450 },
  PROCLEAR_AST_6: { price_per_box_cents: 5550 },
  PROCLEAR_XR_AST_6: { price_per_box_cents: 10100 },
  PROCLEAR_MF_6: { price_per_box_cents: 6450 },
  PROCLEAR_XR_MF_6: { price_per_box_cents: 10275 },
  PROCLEAR_AST_MF_6: { price_per_box_cents: 12200 },
} as const satisfies Record<string, PriceEntry>;

/**
 * Automatically derived SKU type
 */
export type CooperVisionSKU = keyof typeof COOPERVISION_PRICING;

/**
 * Alias for consistency with other pricing modules
 */
export type CooperVisionPricingKey = CooperVisionSKU;