import type { PowerEvidenceByEye, PowerSignVerification } from "./powerSignVerification";

export type PrescriptionOcrEye = {
  sphere?: number | null;
  cylinder?: number | null;
  axis?: number | null;
  add?: string | null;
  baseCurve?: number | null;
  diameter?: number | null;
  brand_raw?: string | null;
};

export type PrescriptionOcrInterpretation = {
  right?: PrescriptionOcrEye | null;
  left?: PrescriptionOcrEye | null;
  expirationDate?: string | null;
  patient_name?: string | null;
  doctor_name?: string | null;
  prescriber_phone?: string | null;
  brand_raw?: string | null;
  confidence?: number;
  looks_like_contact_lens_rx?: boolean;
  notes?: string | null;
  power_evidence?: Partial<Record<"right" | "left", PowerEvidenceByEye | null>>;
  power_sign_verification?: PowerSignVerification;
};

export type ParsedPrescriptionRx = {
  right: ParsedPrescriptionEye | null;
  left: ParsedPrescriptionEye | null;
  expires: string | null;
};

type ParsedPrescriptionEye = {
  sphere: number | null;
  cylinder: number | null;
  axis: number | null;
  add: string | null;
  base_curve: number | null;
  diameter: number | null;
  brand_raw: string | null;
};

/** Preserves the model's signed numeric values exactly for later validation. */
export function mapPrescriptionInterpretationToRx(
  interpretation: PrescriptionOcrInterpretation,
): ParsedPrescriptionRx {
  const mapEye = (eye: PrescriptionOcrEye | null | undefined): ParsedPrescriptionEye | null =>
    eye
      ? {
          sphere: eye.sphere ?? null,
          cylinder: eye.cylinder ?? null,
          axis: eye.axis ?? null,
          add: eye.add ?? null,
          base_curve: eye.baseCurve ?? null,
          diameter: eye.diameter ?? null,
          brand_raw: eye.brand_raw ?? interpretation.brand_raw ?? null,
        }
      : null;

  return {
    right: mapEye(interpretation.right),
    left: mapEye(interpretation.left),
    expires: interpretation.expirationDate ?? null,
  };
}
