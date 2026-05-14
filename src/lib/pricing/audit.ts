import { lenses } from "@/LensCore/data/lenses";
import { ALCON_PRICING } from "./alcon";
import { BAUSCH_PRICING } from "./bausch";
import { COOPERVISION_PRICING } from "./coopervision";
import type { Manufacturer } from "./getPrice";
import { CORE_TO_SKUS } from "./resolveDefaultSku";
import { getSkuBoxDurationMonths } from "./skuDefaults";
import { VISTAKON_PRICING } from "./vistakon";

type PriceEntry = {
  price_per_box_cents: number;
};

type PricingTable = Readonly<Record<string, PriceEntry>>;

export type PricingAuditSeverity = "info" | "review" | "risk";

export type PricingAuditWarningCode =
  | "cost_basis_missing"
  | "low_estimated_margin"
  | "low_retail_per_supply_month"
  | "missing_pricing_for_mapped_sku"
  | "missing_sku_mapping"
  | "pricing_sku_not_mapped"
  | "shipping_cost_missing"
  | "sku_duration_unknown"
  | "unknown_pricing_sku";

export type PricingAuditWarning = {
  code: PricingAuditWarningCode;
  severity: PricingAuditSeverity;
  message: string;
  coreId?: string;
  sku?: string;
  manufacturer?: Manufacturer | "unknown";
};

export type PricingAuditReport = {
  summary: {
    lensCount: number;
    mappedCoreCount: number;
    pricingSkuCount: number;
    cooperVisionLensCount: number;
    cooperVisionPricingSkuCount: number;
  };
  warnings: PricingAuditWarning[];
};

export type PricingAdjustment = {
  /** Decimal delta: 0.05 raises price 5%, -0.05 lowers price 5%. */
  percentDelta?: number;
  fixedDeltaCents?: number;
  floorCents?: number;
  ceilingCents?: number;
};

export type OrderEconomicsInput = {
  sku: string;
  boxCount: number;
  shippingChargedCents?: number | null;
  estimatedUnitCostCents?: number | null;
  estimatedShippingCostCents?: number | null;
};

export type OrderEconomicsEstimate = {
  sku: string;
  manufacturer: Manufacturer | "unknown";
  boxCount: number;
  monthsPerBox: number | null;
  totalMonths: number | null;
  pricePerBoxCents: number | null;
  productRevenueCents: number | null;
  shippingChargedCents: number;
  estimatedUnitCostCents: number | null;
  estimatedProductCostCents: number | null;
  estimatedShippingCostCents: number | null;
  estimatedGrossMarginCents: number | null;
  estimatedGrossMarginRate: number | null;
  shippingImpactCents: number | null;
  annualizedProductRevenueCents: number | null;
  warnings: PricingAuditWarning[];
};

const PRICING_TABLES: Record<Manufacturer, PricingTable> = {
  vistakon: VISTAKON_PRICING,
  bausch: BAUSCH_PRICING,
  coopervision: COOPERVISION_PRICING,
  alcon: ALCON_PRICING,
};

const LOW_PRICE_PER_SUPPLY_MONTH_CENTS = 800;
const REVIEW_PRICE_PER_SUPPLY_MONTH_CENTS = 1200;
const LOW_MARGIN_RATE = 0.2;

function safeDurationMonths(sku: string): number | null {
  try {
    const duration = getSkuBoxDurationMonths(sku);
    return Number.isFinite(duration) && duration > 0 ? duration : null;
  } catch {
    return null;
  }
}

function normalizeCents(value?: number | null): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
}

function normalizeBoxCount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function getPricingRows() {
  return (
    Object.entries(PRICING_TABLES) as [Manufacturer, PricingTable][]
  ).flatMap(([manufacturer, table]) =>
    Object.entries(table).map(([sku, entry]) => ({
      sku,
      manufacturer,
      price_per_box_cents: entry.price_per_box_cents,
    })),
  );
}

function lookupPricingRow(sku: string) {
  return getPricingRows().find((row) => row.sku === sku) ?? null;
}

export function applyPricingAdjustment(
  priceCents: number,
  adjustment?: PricingAdjustment | null,
): number {
  if (!adjustment) return Math.max(0, Math.round(priceCents));

  let next = priceCents;

  if (typeof adjustment.percentDelta === "number") {
    next *= 1 + adjustment.percentDelta;
  }

  if (typeof adjustment.fixedDeltaCents === "number") {
    next += adjustment.fixedDeltaCents;
  }

  if (typeof adjustment.floorCents === "number") {
    next = Math.max(next, adjustment.floorCents);
  }

  if (typeof adjustment.ceilingCents === "number") {
    next = Math.min(next, adjustment.ceilingCents);
  }

  return Math.max(0, Math.round(next));
}

export function getPricingAuditReport(): PricingAuditReport {
  const pricingRows = getPricingRows();
  const pricingSkuSet = new Set(pricingRows.map((row) => row.sku));
  const lensCoreIds = new Set(lenses.map((lens) => lens.coreId));
  const mappedSkuRows = Object.entries(CORE_TO_SKUS).flatMap(
    ([coreId, skus]) => skus.map((sku) => ({ coreId, sku })),
  );
  const mappedSkuSet = new Set(mappedSkuRows.map((row) => row.sku));

  const warnings: PricingAuditWarning[] = [];

  for (const lens of lenses) {
    if (!(lens.coreId in CORE_TO_SKUS)) {
      warnings.push({
        code: "missing_sku_mapping",
        severity: "risk",
        coreId: lens.coreId,
        manufacturer: "unknown",
        message: `No SKU mapping exists for ${lens.displayName}.`,
      });
    }
  }

  for (const coreId of Object.keys(CORE_TO_SKUS)) {
    if (!lensCoreIds.has(coreId)) {
      warnings.push({
        code: "missing_sku_mapping",
        severity: "risk",
        coreId,
        manufacturer: "unknown",
        message: `SKU mapping references unknown lens coreId ${coreId}.`,
      });
    }
  }

  for (const row of mappedSkuRows) {
    if (!pricingSkuSet.has(row.sku)) {
      warnings.push({
        code: "missing_pricing_for_mapped_sku",
        severity: "risk",
        coreId: row.coreId,
        sku: row.sku,
        manufacturer: "unknown",
        message: `SKU ${row.sku} is mapped to ${row.coreId} but has no retail price.`,
      });
    }
  }

  for (const row of pricingRows) {
    if (!mappedSkuSet.has(row.sku)) {
      warnings.push({
        code: "pricing_sku_not_mapped",
        severity: "review",
        sku: row.sku,
        manufacturer: row.manufacturer,
        message: `SKU ${row.sku} has a price but is not reachable through CORE_TO_SKUS.`,
      });
    }

    const monthsPerBox = safeDurationMonths(row.sku);

    if (monthsPerBox === null) {
      warnings.push({
        code: "sku_duration_unknown",
        severity: "risk",
        sku: row.sku,
        manufacturer: row.manufacturer,
        message: `SKU ${row.sku} cannot derive supply duration.`,
      });
      continue;
    }

    const pricePerSupplyMonthCents = Math.round(
      row.price_per_box_cents / monthsPerBox,
    );

    if (pricePerSupplyMonthCents < LOW_PRICE_PER_SUPPLY_MONTH_CENTS) {
      warnings.push({
        code: "low_retail_per_supply_month",
        severity: "risk",
        sku: row.sku,
        manufacturer: row.manufacturer,
        message: `SKU ${row.sku} retails below $${(
          LOW_PRICE_PER_SUPPLY_MONTH_CENTS / 100
        ).toFixed(2)} per supply month per eye.`,
      });
    } else if (
      row.manufacturer === "coopervision" &&
      pricePerSupplyMonthCents < REVIEW_PRICE_PER_SUPPLY_MONTH_CENTS
    ) {
      warnings.push({
        code: "low_retail_per_supply_month",
        severity: "review",
        sku: row.sku,
        manufacturer: row.manufacturer,
        message: `CooperVision SKU ${row.sku} is below the review threshold for supply-month revenue.`,
      });
    }
  }

  return {
    summary: {
      lensCount: lenses.length,
      mappedCoreCount: Object.keys(CORE_TO_SKUS).length,
      pricingSkuCount: pricingRows.length,
      cooperVisionLensCount: lenses.filter(
        (lens) => lens.manufacturer === "COOPERVISION",
      ).length,
      cooperVisionPricingSkuCount: Object.keys(COOPERVISION_PRICING).length,
    },
    warnings,
  };
}

export function estimateOrderEconomics(
  input: OrderEconomicsInput,
): OrderEconomicsEstimate {
  const boxCount = normalizeBoxCount(input.boxCount);
  const shippingChargedCents = normalizeCents(input.shippingChargedCents) ?? 0;
  const estimatedUnitCostCents = normalizeCents(input.estimatedUnitCostCents);
  const estimatedShippingCostCents = normalizeCents(
    input.estimatedShippingCostCents,
  );
  const pricing = lookupPricingRow(input.sku);
  const monthsPerBox = safeDurationMonths(input.sku);
  const totalMonths = monthsPerBox === null ? null : monthsPerBox * boxCount;
  const warnings: PricingAuditWarning[] = [];

  if (monthsPerBox === null) {
    warnings.push({
      code: "sku_duration_unknown",
      severity: "risk",
      sku: input.sku,
      manufacturer: pricing?.manufacturer ?? "unknown",
      message: `SKU ${input.sku} cannot derive supply duration.`,
    });
  }

  if (!pricing) {
    warnings.push({
      code: "unknown_pricing_sku",
      severity: "risk",
      sku: input.sku,
      manufacturer: "unknown",
      message: `Cannot estimate economics for unknown SKU ${input.sku}.`,
    });

    return {
      sku: input.sku,
      manufacturer: "unknown",
      boxCount,
      monthsPerBox,
      totalMonths,
      pricePerBoxCents: null,
      productRevenueCents: null,
      shippingChargedCents,
      estimatedUnitCostCents,
      estimatedProductCostCents: null,
      estimatedShippingCostCents,
      estimatedGrossMarginCents: null,
      estimatedGrossMarginRate: null,
      shippingImpactCents: null,
      annualizedProductRevenueCents: null,
      warnings,
    };
  }

  const productRevenueCents = pricing.price_per_box_cents * boxCount;
  const estimatedProductCostCents =
    estimatedUnitCostCents === null
      ? null
      : estimatedUnitCostCents * boxCount;
  const shippingImpactCents =
    estimatedShippingCostCents === null
      ? null
      : shippingChargedCents - estimatedShippingCostCents;
  const estimatedGrossMarginCents =
    estimatedProductCostCents === null || estimatedShippingCostCents === null
      ? null
      : productRevenueCents +
        shippingChargedCents -
        estimatedProductCostCents -
        estimatedShippingCostCents;
  const totalRevenueCents = productRevenueCents + shippingChargedCents;
  const estimatedGrossMarginRate =
    estimatedGrossMarginCents === null || totalRevenueCents <= 0
      ? null
      : estimatedGrossMarginCents / totalRevenueCents;
  const annualizedProductRevenueCents =
    totalMonths && totalMonths > 0
      ? Math.round((productRevenueCents * 12) / totalMonths)
      : null;

  if (estimatedUnitCostCents === null) {
    warnings.push({
      code: "cost_basis_missing",
      severity: "info",
      sku: input.sku,
      manufacturer: pricing.manufacturer,
      message: "Estimated unit cost is missing, so margin is revenue-only.",
    });
  }

  if (estimatedShippingCostCents === null) {
    warnings.push({
      code: "shipping_cost_missing",
      severity: "info",
      sku: input.sku,
      manufacturer: pricing.manufacturer,
      message: "Estimated shipping cost is missing, so shipping impact is unavailable.",
    });
  }

  if (
    estimatedGrossMarginRate !== null &&
    estimatedGrossMarginRate < LOW_MARGIN_RATE
  ) {
    warnings.push({
      code: "low_estimated_margin",
      severity: "risk",
      sku: input.sku,
      manufacturer: pricing.manufacturer,
      message: `Estimated gross margin is below ${Math.round(
        LOW_MARGIN_RATE * 100,
      )}%.`,
    });
  }

  return {
    sku: input.sku,
    manufacturer: pricing.manufacturer,
    boxCount,
    monthsPerBox,
    totalMonths,
    pricePerBoxCents: pricing.price_per_box_cents,
    productRevenueCents,
    shippingChargedCents,
    estimatedUnitCostCents,
    estimatedProductCostCents,
    estimatedShippingCostCents,
    estimatedGrossMarginCents,
    estimatedGrossMarginRate,
    shippingImpactCents,
    annualizedProductRevenueCents,
    warnings,
  };
}
