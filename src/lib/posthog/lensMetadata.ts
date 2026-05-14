import { lenses } from "@/LensCore/data/lenses";
import type { LensCore } from "@/LensCore/types";
import { getLensSkus } from "@/lib/pricing/getLensSkus";
import { getPackSizeFromSku } from "@/lib/pricing/getPackSize";
import { getSkuBoxDurationMonths } from "@/lib/pricing/skuDefaults";
import type { AnalyticsProperties } from "./events";

type LensMetadataOptions = {
  source?: string;
  lowestPriceCents?: number | null;
  skus?: readonly string[];
};

type CartLensInput = {
  rx?: {
    right?: { coreId?: string | null } | null;
    left?: { coreId?: string | null } | null;
  } | null;
  sku?: string | null;
  manufacturer?: string | null;
  total_amount_cents?: number | null;
  shipping_cents?: number | null;
  box_count?: number | null;
  total_box_count?: number | null;
  right_box_count?: number | null;
  left_box_count?: number | null;
};

function safeSkuDurationMonths(sku: string): number | null {
  try {
    const months = getSkuBoxDurationMonths(sku);
    return Number.isFinite(months) && months > 0 ? months : null;
  } catch {
    return null;
  }
}

function replacementCategory(replacement: string): string {
  if (replacement === "DD") return "daily";
  if (replacement === "1W") return "weekly";
  if (replacement === "2W") return "two_week";
  if (replacement === "1M") return "monthly";
  return "unknown";
}

function specialtyFlags(lens: LensCore): string {
  const flags = [
    lens.type.toric ? "toric" : null,
    lens.type.multifocal ? "multifocal" : null,
    lens.coreId.includes("_XR") ? "xr" : null,
  ].filter((flag): flag is string => Boolean(flag));

  return flags.length > 0 ? flags.join(",") : "standard";
}

function summarizeSkus(skus: readonly string[]) {
  const durations = skus
    .map(safeSkuDurationMonths)
    .filter((duration): duration is number => duration !== null);
  const packSizes = skus
    .map(getPackSizeFromSku)
    .filter((packSize): packSize is number => packSize !== null);

  return {
    sku_count: skus.length,
    sku_pack_sizes: [...new Set(packSizes)].sort((a, b) => a - b).join(","),
    max_box_duration_months:
      durations.length > 0 ? Math.max(...durations) : null,
    annual_supply_box_available: durations.some((duration) => duration >= 12),
  };
}

export function findLensByCoreId(coreId?: string | null): LensCore | null {
  if (!coreId) return null;
  return lenses.find((lens) => lens.coreId === coreId) ?? null;
}

export function getLensAnalyticsProperties(
  lens: LensCore,
  options: LensMetadataOptions = {},
): AnalyticsProperties {
  const skus = options.skus ?? getLensSkus(lens);
  const skuSummary = summarizeSkus(skus);

  return {
    core_id: lens.coreId,
    lens_name: lens.displayName,
    manufacturer: lens.manufacturer,
    replacement_schedule: lens.replacement,
    lens_category: replacementCategory(lens.replacement),
    is_toric: lens.type.toric,
    is_multifocal: lens.type.multifocal,
    is_xr: lens.coreId.includes("_XR"),
    specialty_flags: specialtyFlags(lens),
    source: options.source,
    lowest_price_cents: options.lowestPriceCents ?? null,
    ...skuSummary,
  };
}

export function getLensAnalyticsPropertiesByCoreId(
  coreId?: string | null,
  options: LensMetadataOptions = {},
): AnalyticsProperties {
  const lens = findLensByCoreId(coreId);

  if (!lens) {
    return {
      core_id: coreId ?? null,
      lens_found: false,
      source: options.source,
    };
  }

  return {
    lens_found: true,
    ...getLensAnalyticsProperties(lens, options),
  };
}

export function getCartLensAnalyticsProperties(
  cart: CartLensInput,
): AnalyticsProperties {
  const rightCoreId = cart.rx?.right?.coreId ?? null;
  const leftCoreId = cart.rx?.left?.coreId ?? null;
  const primaryCoreId = rightCoreId ?? leftCoreId;
  const rightBoxes = cart.right_box_count ?? 0;
  const leftBoxes = cart.left_box_count ?? 0;
  const totalBoxes =
    cart.total_box_count ?? cart.box_count ?? rightBoxes + leftBoxes;
  const monthsPerBox = cart.sku ? safeSkuDurationMonths(cart.sku) : null;
  const supplyDurationMonths =
    totalBoxes && monthsPerBox ? totalBoxes * monthsPerBox : null;
  const lensMetadata = getLensAnalyticsPropertiesByCoreId(primaryCoreId);

  return {
    ...lensMetadata,
    right_core_id: rightCoreId,
    left_core_id: leftCoreId,
    has_mixed_lenses: Boolean(
      rightCoreId && leftCoreId && rightCoreId !== leftCoreId,
    ),
    manufacturer: cart.manufacturer ?? lensMetadata.manufacturer ?? null,
    sku: cart.sku ?? null,
    total_boxes: totalBoxes ?? null,
    right_box_count: cart.right_box_count ?? null,
    left_box_count: cart.left_box_count ?? null,
    cart_value_cents: cart.total_amount_cents ?? null,
    total_cart_value_cents: cart.total_amount_cents ?? null,
    shipping_cents: cart.shipping_cents ?? null,
    months_per_box: monthsPerBox,
    supply_duration_months: supplyDurationMonths,
    estimated_annual_supply: Boolean(
      supplyDurationMonths && supplyDurationMonths >= 12,
    ),
  };
}
