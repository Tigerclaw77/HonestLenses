import { getLensById, validateLensParams } from "@/LensCore";
import type { LensCore, RxPayload } from "@/LensCore/types";
import { listManagedCatalogFamilies } from "./repository";
import { managedInputToLensCore } from "./validation";
import type { ManagedCatalogFamily } from "./types";

/**
 * Runtime lookup deliberately checks the static catalog first. That keeps the
 * legacy 81-family request path exactly as it was, including when the managed
 * catalog migration has not yet been applied.
 */
export async function findManagedCatalogFamily(coreId: string): Promise<ManagedCatalogFamily | null> {
  return (await listManagedCatalogFamilies()).find((family) => family.coreId === coreId && family.active) ?? null;
}

export async function getRuntimeLens(coreId: string): Promise<LensCore | null> {
  const sourceLens = getLensById(coreId);
  if (sourceLens) return sourceLens;
  const managed = await findManagedCatalogFamily(coreId);
  return managed ? managedInputToLensCore(managed) : null;
}

export async function validateRuntimeLens(coreId: string, rx: RxPayload) {
  const lens = await getRuntimeLens(coreId);
  return lens ? validateLensParams(lens, rx) : { valid: false, errors: ["Lens not found."] };
}
