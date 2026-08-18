import type { ManagedCatalogFamily } from "./types";

export function isManagedFamilyCustomerOrderable(
  family: Pick<ManagedCatalogFamily, "active" | "browseVisible">,
): boolean {
  return family.active && family.browseVisible;
}
