import { SKU_BOX_DURATION_MONTHS } from "../pricing/skuDefaults";

/* =========================
   Quantity Configuration
   (RX → Supply → Per-eye qty)
========================= */

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const MIN_MONTHS_FOR_ANNUAL = 5;

/* ---------- Helpers ---------- */

function monthsRemainingFromRx(expires: string): number {
  const exp = new Date(expires);
  if (Number.isNaN(exp.getTime())) return 0;

  const now = new Date();
  const diffMs = exp.getTime() - now.getTime();
  return Math.max(0, Math.floor(diffMs / (MS_PER_DAY * 30)));
}

/**
 * 🔒 LOCKED BUSINESS RULE
 * ≥ 5 months remaining → allow 12
 * otherwise → 6
 */
function getAllowedSupplyMonths(expires: string): 6 | 12 {
  return monthsRemainingFromRx(expires) >= MIN_MONTHS_FOR_ANNUAL ? 12 : 6;
}

/* =========================
   Public API
========================= */

export type QuantityConfig = {
  durationMonths: number;
  durationLabel: string;
  defaultPerEye: number;
  maxPerEye: number;
  options: number[];
};

/**
 * Authoritative quantity logic.
 * This is the SINGLE source of truth.
 */
export function buildQuantityConfig(
  expires: string,
  sku: string,
): QuantityConfig | null {
  const durationMonths = SKU_BOX_DURATION_MONTHS[sku];
  if (!durationMonths) return null;

  const supplyMonths = getAllowedSupplyMonths(expires);

  // ✅ default per-eye
  const defaultPerEye = Math.ceil(supplyMonths / durationMonths);

  // ✅ cap per-eye (existing behavior)
  const maxPerEye = defaultPerEye * 2;

  const options: number[] = [0];
  for (let i = 1; i <= maxPerEye; i += 1) {
    options.push(i);
  }

  const durationLabel =
    durationMonths === 1
      ? "30-pack"
      : durationMonths === 3
        ? "90-pack"
        : `${durationMonths}-month`;

  return {
    durationMonths,
    durationLabel,
    defaultPerEye,
    maxPerEye,
    options,
  };
}
