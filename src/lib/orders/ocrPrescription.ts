import { normalizePrescriptionAdd } from "./prescriptionAdd";

export type OcrPrescriptionEye = {
  sphere?: number | null;
  cylinder?: number | null;
  axis?: number | null;
  add?: string | null;
  baseCurve?: number | null;
  diameter?: number | null;
  brand_raw?: string | null;
};

export type OcrPrescriptionInterpretation = {
  right?: OcrPrescriptionEye | null;
  left?: OcrPrescriptionEye | null;
  expirationDate?: string | null;
  patient_name?: string | null;
  doctor_name?: string | null;
  prescriber_phone?: string | null;
  brand_raw?: string | null;
  confidence?: number;
  looks_like_contact_lens_rx?: boolean;
  notes?: string | null;
};

export type CategoricalAddRecovery = {
  right_add?: string | null;
  left_add?: string | null;
};

export type PersistedPrescriptionEye = {
  sphere: number | null;
  cylinder: number | null;
  axis: number | null;
  add: string | null;
  base_curve: number | null;
  diameter: number | null;
  brand_raw: string | null;
};

export type PersistedOcrPrescription = {
  right: PersistedPrescriptionEye | null;
  left: PersistedPrescriptionEye | null;
  expires: string | null;
};

function mapEye(
  eye: OcrPrescriptionEye | null | undefined,
  topLevelBrand: string | null | undefined,
): PersistedPrescriptionEye | null {
  if (!eye) return null;
  return {
    sphere: eye.sphere ?? null,
    cylinder: eye.cylinder ?? null,
    axis: eye.axis ?? null,
    add: normalizePrescriptionAdd(eye.add),
    base_curve: eye.baseCurve ?? null,
    diameter: eye.diameter ?? null,
    brand_raw: eye.brand_raw ?? topLevelBrand ?? null,
  };
}

export function mapOcrInterpretationToPrescription(
  interpretation: OcrPrescriptionInterpretation,
): PersistedOcrPrescription {
  return {
    right: mapEye(interpretation.right, interpretation.brand_raw),
    left: mapEye(interpretation.left, interpretation.brand_raw),
    expires: interpretation.expirationDate ?? null,
  };
}

export function hasMultifocalProductSignal(value: unknown): boolean {
  return (
    typeof value === "string" &&
    /\b(?:multifocal|mf)\b/i.test(value.replace(/[-_/]+/g, " "))
  );
}

export function categoricalAddRecoveryEyes(
  interpretation: OcrPrescriptionInterpretation,
  requiredMultifocalEyes: readonly ("right" | "left")[] = [],
): Array<"right" | "left"> {
  const topLevelSignal = hasMultifocalProductSignal(interpretation.brand_raw);
  const required = new Set(requiredMultifocalEyes);
  return (["right", "left"] as const).filter((eyeName) => {
    const eye = interpretation[eyeName];
    if (!eye || normalizePrescriptionAdd(eye.add)) return false;
    return (
      required.has(eyeName) ||
      topLevelSignal ||
      hasMultifocalProductSignal(eye.brand_raw)
    );
  });
}

/**
 * A focused image re-read may fill only a previously missing categorical ADD.
 * It cannot replace any first-pass value or supply numeric prescription data.
 */
export function applyCategoricalAddRecovery(
  interpretation: OcrPrescriptionInterpretation,
  recovery: CategoricalAddRecovery,
  requiredMultifocalEyes: readonly ("right" | "left")[] = [],
): OcrPrescriptionInterpretation {
  const eligible = new Set(
    categoricalAddRecoveryEyes(interpretation, requiredMultifocalEyes),
  );
  const next = structuredClone(interpretation);

  for (const eyeName of ["right", "left"] as const) {
    if (!eligible.has(eyeName) || !next[eyeName]) continue;
    const recovered = normalizePrescriptionAdd(recovery[`${eyeName}_add`]);
    if (!recovered || !["LO", "LOW", "MED", "MID", "HI", "HIGH"].includes(recovered)) {
      continue;
    }
    next[eyeName]!.add = recovered;
  }

  return next;
}
