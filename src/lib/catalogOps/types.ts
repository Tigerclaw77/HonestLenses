import type { LensCore } from "@/LensCore/types";

export type CatalogManufacturer =
  | "VISTAKON"
  | "ALCON"
  | "BAUSCH + LOMB"
  | "COOPERVISION";

export type PricingManufacturer =
  | "vistakon"
  | "alcon"
  | "bausch"
  | "coopervision";

export type ReplacementCode = "DD" | "1W" | "2W" | "1M";

export type CatalogIssueSeverity = "error" | "warning" | "info";

export type CatalogIssue = {
  severity: CatalogIssueSeverity;
  code: string;
  message: string;
  context?: string;
};

export type PricingIndexEntry = {
  manufacturer: PricingManufacturer;
  pricePerBoxCents: number;
};

export type PricingIndex = Record<string, PricingIndexEntry>;

export type CatalogSkuSummary = {
  sku: string;
  packSize: number | null;
  durationMonths: number | null;
  pricePerBoxCents: number | null;
  pricingManufacturer: PricingManufacturer | null;
  issues: CatalogIssue[];
};

export type CatalogAssetSummary = {
  imageRef: string;
  exists: boolean;
  preferredPath: string | null;
  candidates: string[];
};

export type ParameterPreview = {
  baseCurves: string[];
  diameters: string[];
  sphereSummary: string[];
  cylinderValues: string[];
  axisValues: string[];
  addValues: string[];
};

export type CatalogLensSummary = {
  coreId: string;
  displayName: string;
  manufacturer: string;
  replacement: string;
  type: LensCore["type"];
  parameters: LensCore["parameters"];
  browseVisible: boolean;
  skus: CatalogSkuSummary[];
  asset: CatalogAssetSummary;
  parameterPreview: ParameterPreview;
  issues: CatalogIssue[];
};

export type CatalogDraft = {
  originalCoreId?: string;
  coreId: string;
  displayName: string;
  manufacturer: CatalogManufacturer | "";
  replacement: ReplacementCode | "";
  toric: boolean;
  multifocal: boolean;
  browseVisible: boolean;
  imageRef: string;
  skus: string[];
  parameters: LensCore["parameters"] | null;
  acknowledgeMissingImage: boolean;
};

export type CatalogSnapshot = {
  lenses: CatalogLensSummary[];
  manufacturers: CatalogManufacturer[];
  replacements: ReplacementCode[];
  assetNames: string[];
  pricingIndex: PricingIndex;
  mappedSkus: string[];
  globalIssues: CatalogIssue[];
};
