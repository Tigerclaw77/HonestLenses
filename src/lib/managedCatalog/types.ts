import type { LensCore } from "@/LensCore/types";

export type ManagedCatalogSku = {
  sku: string;
  packSize: number;
  pricePerBoxCents: number;
  vendorSku?: string | null;
  vendorOrderIdentifier?: string | null;
  active?: boolean;
};

export type ManagedCatalogImage = {
  storagePath: string;
  altText?: string | null;
  isPrimary?: boolean;
  position?: number;
};

/**
 * This is intentionally a LensCore-shaped record. The same resolver and
 * validator used by the legacy source catalog can therefore validate a
 * managed family without introducing a second Rx rules language.
 */
export type ManagedCatalogFamilyInput = {
  coreId: string;
  displayName: string;
  manufacturer: "VISTAKON" | "ALCON" | "BAUSCH + LOMB" | "COOPERVISION";
  replacement: "DD" | "1W" | "2W" | "1M";
  type: LensCore["type"];
  parameters: LensCore["parameters"];
  active: boolean;
  browseVisible: boolean;
  vendorOrderIdentifier?: string | null;
  skus: ManagedCatalogSku[];
  images: ManagedCatalogImage[];
};

export type ManagedCatalogFamily = ManagedCatalogFamilyInput & {
  id: string;
  versionId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type ManagedCatalogValidationIssue = {
  field: string;
  message: string;
};
