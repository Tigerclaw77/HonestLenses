export type NormalizedManufacturer =
  | "Alcon"
  | "Vistakon / Johnson & Johnson Vision";

type SkuManufacturerEntry = {
  manufacturer: NormalizedManufacturer;
  source: string;
  aliases: readonly string[];
};

export const SKU_MANUFACTURER_NORMALIZATION: Record<string, SkuManufacturerEntry> = {
  AO_HG_AST_6: {
    manufacturer: "Alcon",
    source: "LensCore AO_HG_AST manufacturer and Alcon pricing table",
    aliases: ["ALCON"],
  },
  VITA_12: {
    manufacturer: "Vistakon / Johnson & Johnson Vision",
    source: "LensCore VITA manufacturer and Vistakon pricing table",
    aliases: ["VISTAKON", "Johnson & Johnson Vision"],
  },
} as const;

export function resolveManufacturerFromSku(
  sku?: string | null,
): SkuManufacturerEntry | null {
  const normalizedSku = String(sku ?? "").trim().toUpperCase();
  if (!normalizedSku) return null;
  return SKU_MANUFACTURER_NORMALIZATION[normalizedSku] ?? null;
}

export function resolveOrderManufacturer(
  manufacturer?: string | null,
  sku?: string | null,
) {
  if (typeof manufacturer === "string" && !manufacturerMissing(manufacturer)) {
    return manufacturer.trim();
  }
  return resolveManufacturerFromSku(sku)?.manufacturer ?? null;
}

function manufacturerMissing(value?: string | null) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return !normalized || normalized === "unknown" || normalized === "null";
}
