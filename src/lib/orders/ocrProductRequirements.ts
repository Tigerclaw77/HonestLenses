import { lenses } from "@/LensCore";
import { resolveBrand } from "@/lib/resolveBrand";
import {
  hasMultifocalProductSignal,
  type OcrPrescriptionEye,
  type OcrPrescriptionInterpretation,
} from "./ocrPrescription";

type EyeName = "right" | "left";

export type OcrProductIssue = {
  eye: EyeName;
  coreId: string | null;
  field: "add" | "cylinder" | "axis" | "baseCurve" | "diameter";
  reason: "required_missing";
};

export type OcrProductAssessment = {
  issues: OcrProductIssue[];
  multifocalEyes: EyeName[];
  productCoreIds: Partial<Record<EyeName, string>>;
};

export function calibrateOcrConfidence(
  modelConfidence: number | null | undefined,
  issues: readonly OcrProductIssue[],
  reconciliationAttempted: boolean,
): number {
  const confidence =
    typeof modelConfidence === "number" && Number.isFinite(modelConfidence)
      ? Math.max(0, Math.min(modelConfidence, 1))
      : 0;
  if (issues.length > 0) return Math.min(confidence, 0.5);
  if (reconciliationAttempted) return Math.min(confidence, 0.99);
  return confidence;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function productForEye(
  eye: OcrPrescriptionEye,
  topLevelBrand: string | null | undefined,
  selectedCoreId: string | null | undefined,
) {
  const selected = selectedCoreId
    ? lenses.find((lens) => lens.coreId === selectedCoreId)
    : null;
  if (selected) return selected;

  const brand = eye.brand_raw ?? topLevelBrand;
  if (!brand) return null;
  const resolved = resolveBrand(
    {
      rawString: brand,
      hasCyl:
        (finite(eye.cylinder) && Math.abs(eye.cylinder) > 0.001) ||
        (finite(eye.axis) && Math.abs(eye.axis) > 0.001),
      hasAdd: Boolean(eye.add?.trim()) || hasMultifocalProductSignal(brand),
      bc: finite(eye.baseCurve) ? eye.baseCurve : null,
      dia: finite(eye.diameter) ? eye.diameter : null,
    },
    lenses,
  );
  return resolved.lensId
    ? lenses.find((lens) => lens.coreId === resolved.lensId) ?? null
    : null;
}

export function assessOcrProductRequirements(
  interpretation: OcrPrescriptionInterpretation,
  selectedProducts: Partial<Record<EyeName, string | null>> = {},
): OcrProductAssessment {
  const issues: OcrProductIssue[] = [];
  const multifocalEyes: EyeName[] = [];
  const productCoreIds: Partial<Record<EyeName, string>> = {};

  for (const eyeName of ["right", "left"] as const) {
    const eye = interpretation[eyeName];
    if (!eye) continue;
    const brand = eye.brand_raw ?? interpretation.brand_raw;
    const product = productForEye(
      eye,
      interpretation.brand_raw,
      selectedProducts[eyeName],
    );
    const requiresToric =
      product?.type.toric === true ||
      (typeof brand === "string" && /\b(?:toric|astigmatism|ast)\b/i.test(brand));
    const requiresMultifocal =
      product?.type.multifocal === true || hasMultifocalProductSignal(brand);

    if (product) productCoreIds[eyeName] = product.coreId;
    if (requiresMultifocal) multifocalEyes.push(eyeName);

    const missing = (
      field: OcrProductIssue["field"],
      value: unknown,
    ) => {
      if (value === null || value === undefined || value === "") {
        issues.push({
          eye: eyeName,
          coreId: product?.coreId ?? null,
          field,
          reason: "required_missing",
        });
      }
    };

    if (requiresToric) {
      missing("cylinder", eye.cylinder);
      missing("axis", eye.axis);
    }
    if (requiresMultifocal) missing("add", eye.add);
    if ((product?.parameters.baseCurve?.length ?? 0) > 0) {
      missing("baseCurve", eye.baseCurve);
    }
    if ((product?.parameters.diameter?.length ?? 0) > 0) {
      missing("diameter", eye.diameter);
    }
  }

  return { issues, multifocalEyes, productCoreIds };
}
