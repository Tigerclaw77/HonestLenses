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
 *
 * Cost basis: Nassau OOGP Advantage SCL price list, effective Apr 1, 2026.
 * Honest Lenses does not currently have direct CooperVision account pricing,
 * so these retail prices must stay above Nassau acquisition cost.
 */

type PriceEntry = {
  price_per_box_cents: number;
};

export const COOPERVISION_PRICING = {
  // =========================
  // Clariti 1 Day
  // =========================
  CLARITI_1D_30: { price_per_box_cents: 3999 },
  CLARITI_1D_90: { price_per_box_cents: 7999 },
  CLARITI_1D_MF_30: { price_per_box_cents: 6999 },
  CLARITI_1D_MF_90: { price_per_box_cents: 13999 },
  CLARITI_1D_AST_30: { price_per_box_cents: 5499 },
  CLARITI_1D_AST_90: { price_per_box_cents: 10999 },

  // =========================
  // MyDay
  // =========================
  MYDAY_90: { price_per_box_cents: 10499 },
  MYDAY_180: { price_per_box_cents: 18499 },
  MYDAY_ENG_90: { price_per_box_cents: 12499 },
  MYDAY_AST_90: { price_per_box_cents: 13999 },
  MYDAY_MF_90: { price_per_box_cents: 15999 },

  // =========================
  // Proclear Daily
  // =========================
  PROCLEAR_1D_90: { price_per_box_cents: 9999 },
  PROCLEAR_1D_MF_90: { price_per_box_cents: 13999 },

  // =========================
  // Avaira Vitality
  // =========================
  AVAIRA_VIT_6: { price_per_box_cents: 4699 },
  AVAIRA_VIT_AST_6: { price_per_box_cents: 5499 },

  // =========================
  // Biofinity
  // =========================
  BIOFINITY_6: { price_per_box_cents: 5999 },
  BIOFINITY_ENG_6: { price_per_box_cents: 6499 },
  BIOFINITY_XR_6: { price_per_box_cents: 6499 },
  BIOFINITY_AST_6: { price_per_box_cents: 7999 },
  BIOFINITY_XR_AST_6: { price_per_box_cents: 14499 },
  BIOFINITY_MF_6: { price_per_box_cents: 10499 },
  BIOFINITY_AST_MF_6: { price_per_box_cents: 14999 },

  // =========================
  // Biomedics
  // =========================
  BIOMEDICS_6: { price_per_box_cents: 5999 },
  BIOMEDICS_AST_6: { price_per_box_cents: 6999 },

  // =========================
  // Proclear Monthly
  // =========================
  PROCLEAR_6: { price_per_box_cents: 7999 },
  PROCLEAR_AST_6: { price_per_box_cents: 9999 },
  PROCLEAR_XR_AST_6: { price_per_box_cents: 16999 },
  PROCLEAR_MF_6: { price_per_box_cents: 11499 },
  PROCLEAR_XR_MF_6: { price_per_box_cents: 17499 },
  PROCLEAR_AST_MF_6: { price_per_box_cents: 19999 },
} as const satisfies Record<string, PriceEntry>;

/**
 * Automatically derived SKU type
 */
export type CooperVisionSKU = keyof typeof COOPERVISION_PRICING;

/**
 * Alias for consistency with other pricing modules
 */
export type CooperVisionPricingKey = CooperVisionSKU;
