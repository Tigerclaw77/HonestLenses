import type { LensCore, MultifocalGroup, SphereAxisRule, ToricGroup } from "@/LensCore/types";
import type { ManagedCatalogFamilyInput, ManagedCatalogSku } from "./types";
import { getManagedPackDurationMonths } from "./commerce";

export type CatalogProductType = "spherical" | "toric" | "multifocal" | "toric-multifocal";

export function suggestedCatalogCoreId(manufacturer: string, displayName: string): string {
  const normalized = `${manufacturer} ${displayName}`
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || "NEW_LENS";
}

export function catalogProductType(type: LensCore["type"]): CatalogProductType {
  if (type.toric && type.multifocal) return "toric-multifocal";
  if (type.toric) return "toric";
  if (type.multifocal) return "multifocal";
  return "spherical";
}

export function lensTypeFromCatalogProductType(productType: CatalogProductType): LensCore["type"] {
  return {
    toric: productType === "toric" || productType === "toric-multifocal",
    multifocal: productType === "multifocal" || productType === "toric-multifocal",
  };
}

export function parseNumberList(value: string): { values: number[]; error: string | null } {
  const parts = value.split(",").map((item) => item.trim()).filter(Boolean);
  if (!parts.length) return { values: [], error: "Enter at least one value." };
  const values = parts.map(Number);
  if (values.some((item) => !Number.isFinite(item))) {
    return { values: [], error: "Use comma-separated numeric values." };
  }
  return { values, error: null };
}

export function parseCommaSeparatedText(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

/**
 * An editor key is intentionally stable throughout an editing session. It
 * changes only when the operator starts/selects a different lens, never when
 * a parsed value changes, so React keeps the focused input mounted.
 */
export function guidedInputEditorKey(session: number, field: string): string {
  return String(session) + ":" + field;
}

export function formatNumberList(values: readonly number[] | undefined): string {
  return values?.join(", ") ?? "";
}

export function parsePriceToCents(value: string): { cents: number | null; error: string | null } {
  const trimmed = value.trim().replace(/^\$/, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed)) {
    return { cents: null, error: "Enter a whole-dollar or cents amount, for example 49.99." };
  }
  const [dollars, fraction = ""] = trimmed.split(".");
  const cents = Number(dollars) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents <= 0) {
    return { cents: null, error: "Price must be greater than $0.00." };
  }
  return { cents, error: null };
}

export function formatCentsAsPrice(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function formatPowerSegments(spec: LensCore["parameters"]["sphere"]): string {
  return spec?.segments.map((segment) => `${segment.min} to ${segment.max} by ${segment.step}`).join("; ") ?? "Not set";
}

export function getManagedSupplyDurationMonths(replacement: ManagedCatalogFamilyInput["replacement"], packSize: number): number {
  return getManagedPackDurationMonths(replacement, packSize);
}

export function getSupplyDurationLabel(replacement: ManagedCatalogFamilyInput["replacement"], packSize: number): string {
  const months = getManagedSupplyDurationMonths(replacement, packSize);
  return `About ${months} ${months === 1 ? "month" : "months"} per box`;
}

export function emptyManagedCatalogFamily(): ManagedCatalogFamilyInput {
  return {
    coreId: "",
    displayName: "",
    manufacturer: "VISTAKON",
    replacement: "DD",
    type: { toric: false, multifocal: false },
    active: true,
    browseVisible: true,
    vendorOrderIdentifier: "",
    skus: [emptyManagedCatalogSku()],
    images: [],
    parameters: {
      baseCurve: [8.6],
      diameter: [14.2],
      sphere: { segments: [{ min: -6, max: 6, step: 0.25 }] },
    },
  };
}

export function emptyManagedCatalogSku(): ManagedCatalogSku {
  return { sku: "", packSize: 30, pricePerBoxCents: 0, vendorSku: "", vendorOrderIdentifier: "", active: true };
}

export function copyManagedCatalogInput(input: ManagedCatalogFamilyInput): ManagedCatalogFamilyInput {
  return structuredClone(input);
}

export function hasAdvancedOnlySphereRules(parameters: LensCore["parameters"]): boolean {
  return Boolean(parameters.sphereByBaseCurve?.length && !parameters.sphere);
}

export function hasAdvancedToricRules(group: ToricGroup): group is Extract<ToricGroup, { sphereAxisRules: SphereAxisRule[] }> {
  return "sphereAxisRules" in group;
}

export function addToricGroup(parameters: LensCore["parameters"]): LensCore["parameters"] {
  return {
    ...parameters,
    toric: { groups: [...(parameters.toric?.groups ?? []), { cylinders: [], axis: [] }] },
  };
}

export function addMultifocalGroup(parameters: LensCore["parameters"]): LensCore["parameters"] {
  const multifocal = parameters.multifocal ?? { adds: [] };
  const groups: MultifocalGroup[] = [...(multifocal.groups ?? []), { adds: [], sphereRange: { min: -6, max: 6 } }];
  return { ...parameters, multifocal: { ...multifocal, groups } };
}

export function parametersFromAdvancedJson(value: string): { parameters: LensCore["parameters"] | null; error: string | null } {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { parameters: null, error: "Advanced prescription rules must be a JSON object." };
    }
    return { parameters: parsed as LensCore["parameters"], error: null };
  } catch (error) {
    return { parameters: null, error: error instanceof Error ? error.message : "Invalid advanced prescription rules." };
  }
}

export function shouldShowCatalogValidationIssue(field: string, touched: ReadonlySet<string>, publishAttempted: boolean): boolean {
  if (publishAttempted) return true;
  return [...touched].some((item) => field === item || field.startsWith(`${item}.`));
}
