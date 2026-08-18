/**
 * Navigation and copy shared by the protected LensCore console and the
 * persistent managed-catalog workflow. Keeping this separate makes it clear
 * that the source-backed catalog is never an editable database surface.
 */
export const MANAGED_CATALOG_CREATE_HREF = "/admin/catalog?managed=add#managed-catalog";

export const LEGACY_LENSCORE_EDIT_REASON =
  "LensCore families are protected source records and cannot be edited here.";

export const LEGACY_LENSCORE_CLONE_REASON =
  "Cloning a LensCore family could create an ambiguous duplicate. Start a new managed family with approved product data instead.";
