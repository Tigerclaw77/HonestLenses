/**
 * Alcon pricing
 *
 * RULES:
 * - Each SKU represents ONE physical box
 * - No duration / supply intent encoded in SKU
 * - No RX logic
 * - No quantity logic
 * - No pricing explanations
 */

type PriceEntry = {
  price_per_box_cents: number;
};

export const ALCON_PRICING = {
  // =========================
  // DAILIES TOTAL1
  // =========================
  DT1_30: { price_per_box_cents: 4199 },
  DT1_90: { price_per_box_cents: 9999 },
  DT1_AST_30: { price_per_box_cents: 4899 },
  DT1_AST_90: { price_per_box_cents: 11899 },
  DT1_MF_30: { price_per_box_cents: 5599 },
  DT1_MF_90: { price_per_box_cents: 12899 },

  // =========================
  // TOTAL30 (Monthly, 6-pack)
  // =========================
  TOTAL30_6: { price_per_box_cents: 6599 },
  TOTAL30_AST_6: { price_per_box_cents: 6999 },
  TOTAL30_MF_6: { price_per_box_cents: 9499 },
  TOTAL30_AST_MF_6: { price_per_box_cents: 14999 },

  // =========================
  // Precision1
  // =========================
  PRECISION1_30: { price_per_box_cents: 3099 },
  PRECISION1_90: { price_per_box_cents: 6999 },
  PRECISION1_AST_30: { price_per_box_cents: 3999 },
  PRECISION1_AST_90: { price_per_box_cents: 8999 },

  // =========================
  // Precision7
  // =========================
  PRECISION7_12: { price_per_box_cents: 5299 },
  PRECISION7_27: { price_per_box_cents: 8999 },
  PRECISION7_AST_12: { price_per_box_cents: 6499 },
  PRECISION7_AST_27: { price_per_box_cents: 10899 },

  // =========================
  // Air Optix
  // =========================
  AO_HG_6: { price_per_box_cents: 5999 },
  AO_HG_AST_6: { price_per_box_cents: 7699 },
  AO_HG_MF_6: { price_per_box_cents: 9999 },
  AO_ND_6: { price_per_box_cents: 10399 },
  AO_COL_2: { price_per_box_cents: 4599 },
  AO_COL_6: { price_per_box_cents: 10899 },

  // =========================
  // Dailies AquaComfort Plus
  // =========================
  DACP_30: { price_per_box_cents: 2999 },
  DACP_90: { price_per_box_cents: 7599 },
  DACP_AST_30: { price_per_box_cents: 3699 },
  DACP_AST_90: { price_per_box_cents: 9599 },
  DACP_MF_30: { price_per_box_cents: 4799 },
  DACP_MF_90: { price_per_box_cents: 11299 },

  // =========================
  // Dailies Colors
  // =========================
  DAILIES_COL_30: { price_per_box_cents: 3799 },
  DAILIES_COL_90: { price_per_box_cents: 7799 },
} as const satisfies Record<string, PriceEntry>;

/**
 * Automatically derived SKU type
 * Prevents drift between union type and pricing table
 */
export type AlconSKU = keyof typeof ALCON_PRICING;

/**
 * Alias if you prefer this naming elsewhere
 */
export type AlconPricingKey = AlconSKU;