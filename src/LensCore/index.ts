/* ======================================================
   LensCore Public API
   This file is the ONLY allowed import boundary:
   import { lenses, getLensById, validate } from "@/LensCore";
====================================================== */

import { lenses as lensData } from "./data/lenses";
import { validateLensParams } from "./validate";
import type { RxPayload, LensCore } from "./types";

/* =========================
   Public Types
========================= */

export type { RxPayload, LensCore };

/* =========================
   Public Data (Read-Only)
========================= */

/**
 * Canonical lens list.
 * Read-only to prevent accidental mutation.
 */
export const lenses: readonly LensCore[] = lensData;

/* =========================
   Lookup
========================= */

export function getLensById(coreId: string): LensCore | null {
  return lenses.find((l) => l.coreId === coreId) ?? null;
}

/* =========================
   Validation
========================= */

export function validate(lensId: string, rx: RxPayload) {
  const lens = getLensById(lensId);

  if (!lens) {
    return {
      valid: false,
      errors: ["Lens not found."],
    };
  }

  return validateLensParams(lens, rx);
}

/* =========================
   Utilities
========================= */

export * from "./utils";