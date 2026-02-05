/**
 * resolveDefaultSku
 *
 * PURPOSE (MODEL A):
 * Map an internal lens identifier to a PHYSICAL PRODUCT SKU.
 *
 * IMPORTANT:
 * - SKU represents ONE physical box only
 * - No RX expiration logic
 * - No annual / half-year intent
 * - No quantity logic
 * - No pricing logic
 *
 * This file should be BORING and STABLE.
 */

/**
 * Internal lens → physical SKU map
 *
 * Keys:
 * - Internal lens IDs used throughout the app (e.g. from lenses.ts)
 *
 * Values:
 * - Commerce SKUs representing ONE physical box
 */
const SKU_MAP: Record<string, string> = {
  // =========================
  // Vistakon / J&J
  // =========================

  // Acuvue Oasys MAX 1-Day (90 pack)
  V001: "ACUVUE_OASYS_MAX_1DAY_90",

  // Acuvue Oasys 1-Day (90 pack)
  V002: "ACUVUE_OASYS_1DAY_90",

  // Acuvue Oasys (bi-weekly, 6-pack)
  V010: "ACUVUE_OASYS_6PK",

  // Bausch + Lomb Ultra
  BL06: "ULTRA_6PK",
  BL07: "ULTRA_FOR_ASTIGMATISM_6PK",

  // Add additional lenses explicitly as needed
};

/**
 * Resolve physical SKU for a lens
 *
 * @param lensId Internal lens identifier
 * @returns Physical box SKU or null if unsupported
 */
export function resolveDefaultSku(lensId: string): string | null {
  return SKU_MAP[lensId] ?? null;
}
