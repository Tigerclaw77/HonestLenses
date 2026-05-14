import type { Manufacturer } from "./getPrice";

export type PricingAuditManufacturer = Manufacturer | "unknown";

export type CatalogAuditItem = {
  coreId: string;
  displayName: string;
  manufacturer: PricingAuditManufacturer;
  skuCount: number;
};

export type PricingAuditTodo = {
  area: "pricing" | "catalog" | "sku_mapping" | "margin";
  note: string;
};

export type CatalogAuditNote = {
  area: "manufacturer_catalog" | "sku_mapping" | "pricing" | "operations";
  severity: "info" | "review" | "risk";
  note: string;
};

export const PRICING_AUDIT_TODOS: PricingAuditTodo[] = [
  {
    area: "pricing",
    note: "Add supplier cost inputs before broad retail price table changes.",
  },
  {
    area: "margin",
    note: "Add margin review inputs before changing retail price tables.",
  },
  {
    area: "sku_mapping",
    note: "Verify default SKU duration and pack-size mappings before broad pricing edits.",
  },
  {
    area: "catalog",
    note: "Audit outdated lens names, replacement schedules, and manufacturer labels against current catalog data.",
  },
];

export const CATALOG_AUDIT_NOTES: CatalogAuditNote[] = [
  {
    area: "manufacturer_catalog",
    severity: "review",
    note: "CooperVision MiSight 1 day remains excluded because it is specialty myopia-management inventory, not a standard ecommerce lens.",
  },
  {
    area: "pricing",
    severity: "review",
    note: "CooperVision pricing is now orderable; monitor margin and conversion before changing all CooperVision retail prices.",
  },
  {
    area: "sku_mapping",
    severity: "risk",
    note: "SKU mappings must stay aligned with pricing keys because cart resolution depends on CORE_TO_SKUS while browse uses the same source for visible pack options.",
  },
  {
    area: "manufacturer_catalog",
    severity: "review",
    note: "Precision7 is present, but replacement schedule, pack sizes, and retail pricing should be rechecked against supplier data during the next catalog refresh.",
  },
  {
    area: "operations",
    severity: "info",
    note: "Pricing experiments should apply deterministic adjustments on top of the explicit price tables, not mutate table values per request.",
  },
];

export function normalizePricingManufacturer(
  value?: string | null,
): PricingAuditManufacturer {
  const normalized = (value ?? "").trim().toLowerCase();

  if (normalized === "vistakon" || normalized === "johnson & johnson") {
    return "vistakon";
  }

  if (normalized === "alcon") return "alcon";

  if (
    normalized === "bausch" ||
    normalized === "bausch + lomb" ||
    normalized === "bausch+lomb"
  ) {
    return "bausch";
  }

  if (normalized === "coopervision" || normalized === "coop") {
    return "coopervision";
  }

  return "unknown";
}
