import { lenses } from "@/LensCore";
import { resolveBrand } from "@/lib/resolveBrand";

export const UPLOADED_RX_AUTO_VERIFY_MIN_CONFIDENCE = 0.95;

export type UploadedRxExceptionReason =
  | "missing_upload_evidence"
  | "customer_confirmation_missing"
  | "ocr_evidence_missing"
  | "ocr_not_contact_lens_prescription"
  | "ocr_low_confidence"
  | "ocr_ambiguous"
  | "ocr_missing_required_fields"
  | "prescription_expired"
  | "expiration_mismatch"
  | "patient_identity_missing"
  | "patient_mismatch"
  | "prescriber_missing"
  | "prescriber_mismatch"
  | "product_unresolved"
  | "product_mismatch"
  | "parameter_mismatch"
  | "payment_not_capturable"
  | "automation_capture_failed"
  | "automation_state_update_failed";

export type UploadedRxAutomationOrder = {
  rx_upload_path?: unknown;
  rx_status?: unknown;
  rx?: unknown;
  rx_ocr_raw?: unknown;
  patient_name?: unknown;
  prescriber_name?: unknown;
  prescriber_phone?: unknown;
};

export type UploadedRxAutomationDecision =
  | {
      autoVerify: true;
      reason: "all_checks_passed";
      evidence: UploadedRxAutomationEvidence;
    }
  | {
      autoVerify: false;
      reason: UploadedRxExceptionReason;
      detail: string;
      evidence: UploadedRxAutomationEvidence;
    };

export type UploadedRxAutomationEvidence = {
  ocrConfidence: number | null;
  checkedEyes: Array<"right" | "left">;
  resolvedProducts: Partial<Record<"right" | "left", string>>;
  expiration: string | null;
  patientMatched: boolean;
  prescriberMatched: boolean;
};

export type UploadedRxCaptureResult = {
  paymentIntentId: string;
  alreadyCaptured: boolean;
};

export type UploadedRxAutomationRun = {
  decision: UploadedRxAutomationDecision;
  capture: UploadedRxCaptureResult | null;
};

type UnknownRecord = Record<string, unknown>;
type EyeName = "right" | "left";

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function normalizeName(value: unknown): string | null {
  const candidate = text(value);
  if (!candidate) return null;
  return candidate.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizePrescriberName(value: unknown): string | null {
  const candidate = normalizeName(value);
  if (!candidate) return null;
  return candidate.replace(/^(doctor|dr)/, "") || null;
}

function normalizePhone(value: unknown): string | null {
  const candidate = text(value);
  if (!candidate) return null;
  const digits = candidate.replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-10) : null;
}

function normalizeProductName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function numbersMatch(a: unknown, b: unknown): boolean {
  const left = number(a);
  const right = number(b);
  return left !== null && right !== null && Math.abs(left - right) < 0.001;
}

function isoDate(value: unknown): string | null {
  const candidate = text(value);
  if (!candidate || !/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return null;
  const parsed = Date.parse(`${candidate}T00:00:00.000Z`);
  return Number.isFinite(parsed) ? candidate : null;
}

function futureDate(value: string, now: Date): boolean {
  const endOfDay = Date.parse(`${value}T23:59:59.999Z`);
  return endOfDay >= now.getTime();
}

function emptyEvidence(): UploadedRxAutomationEvidence {
  return {
    ocrConfidence: null,
    checkedEyes: [],
    resolvedProducts: {},
    expiration: null,
    patientMatched: false,
    prescriberMatched: false,
  };
}

function review(
  reason: UploadedRxExceptionReason,
  detail: string,
  evidence: UploadedRxAutomationEvidence,
): UploadedRxAutomationDecision {
  return { autoVerify: false, reason, detail, evidence };
}

function compareEye(
  eyeName: EyeName,
  confirmedEye: UnknownRecord,
  ocrEye: UnknownRecord,
  topLevelBrand: string | null,
  evidence: UploadedRxAutomationEvidence,
): UploadedRxAutomationDecision | null {
  const coreId = text(confirmedEye.coreId);
  const lens = coreId ? lenses.find((candidate) => candidate.coreId === coreId) : null;
  if (!coreId || !lens) {
    return review(
      "customer_confirmation_missing",
      `${eyeName} eye has no confirmed catalog product.`,
      evidence,
    );
  }

  if (
    !lens.type.toric &&
    ((number(ocrEye.cylinder) !== null &&
      Math.abs(number(ocrEye.cylinder) ?? 0) > 0.001) ||
      number(ocrEye.axis) !== null)
  ) {
    return review(
      "parameter_mismatch",
      `${eyeName} eye contains toric parameters for a non-toric product.`,
      evidence,
    );
  }
  if (!lens.type.multifocal && text(ocrEye.add)) {
    return review(
      "parameter_mismatch",
      `${eyeName} eye contains add power for a non-multifocal product.`,
      evidence,
    );
  }

  const brandRaw = text(ocrEye.brand_raw) ?? topLevelBrand;
  if (!brandRaw) {
    return review(
      "product_unresolved",
      `${eyeName} eye has no readable product or brand.`,
      evidence,
    );
  }

  const resolved = resolveBrand(
    {
      rawString: brandRaw,
      hasCyl: number(ocrEye.cylinder) !== null,
      hasAdd: text(ocrEye.add) !== null,
      bc: number(ocrEye.baseCurve),
      dia: number(ocrEye.diameter),
    },
    lenses,
  );
  const resolvedLens = resolved.lensId
    ? lenses.find((candidate) => candidate.coreId === resolved.lensId)
    : null;
  const exactCatalogName = Boolean(
    resolvedLens &&
      normalizeProductName(brandRaw) ===
        normalizeProductName(resolvedLens.displayName),
  );
  if (
    !resolved.lensId ||
    (resolved.confidence !== "high" && !exactCatalogName)
  ) {
    return review(
      "product_unresolved",
      `${eyeName} eye product could not be resolved with high confidence.`,
      evidence,
    );
  }
  evidence.resolvedProducts[eyeName] = resolved.lensId;
  if (resolved.lensId !== coreId) {
    return review(
      "product_mismatch",
      `${eyeName} eye confirmed product does not match the uploaded prescription.`,
      evidence,
    );
  }

  if (!numbersMatch(confirmedEye.sphere, ocrEye.sphere)) {
    return review(
      "parameter_mismatch",
      `${eyeName} eye sphere does not match.`,
      evidence,
    );
  }

  if (lens.type.toric) {
    if (
      !numbersMatch(confirmedEye.cylinder, ocrEye.cylinder) ||
      !numbersMatch(confirmedEye.axis, ocrEye.axis)
    ) {
      return review(
        "parameter_mismatch",
        `${eyeName} eye cylinder or axis does not match.`,
        evidence,
      );
    }
  }

  if (lens.type.multifocal) {
    const confirmedAdd = text(confirmedEye.add)?.toLowerCase();
    const ocrAdd = text(ocrEye.add)?.toLowerCase();
    if (!confirmedAdd || !ocrAdd || confirmedAdd !== ocrAdd) {
      return review(
        "parameter_mismatch",
        `${eyeName} eye add power does not match.`,
        evidence,
      );
    }
  }

  const ocrBaseCurve = number(ocrEye.baseCurve);
  const ocrDiameter = number(ocrEye.diameter);
  if (ocrBaseCurve === null || ocrDiameter === null) {
    return review(
      "ocr_missing_required_fields",
      `${eyeName} eye is missing base curve or diameter.`,
      evidence,
    );
  }
  if (
    !(lens.parameters.baseCurve ?? []).includes(ocrBaseCurve) ||
    !(lens.parameters.diameter ?? []).includes(ocrDiameter) ||
    (number(confirmedEye.base_curve) !== null &&
      !numbersMatch(confirmedEye.base_curve, ocrBaseCurve))
  ) {
    return review(
      "parameter_mismatch",
      `${eyeName} eye base curve or diameter does not match the product.`,
      evidence,
    );
  }

  evidence.checkedEyes.push(eyeName);
  return null;
}

export function evaluateUploadedRxAutomation(
  order: UploadedRxAutomationOrder,
  stripeStatus: string | null | undefined,
  now = new Date(),
): UploadedRxAutomationDecision {
  const evidence = emptyEvidence();

  if (!text(order.rx_upload_path)) {
    return review("missing_upload_evidence", "No retained upload exists.", evidence);
  }
  if (order.rx_status !== "uploaded_customer_confirmed") {
    return review(
      "customer_confirmation_missing",
      "The customer has not confirmed the extracted prescription.",
      evidence,
    );
  }
  if (!isRecord(order.rx) || !isRecord(order.rx_ocr_raw)) {
    return review(
      "ocr_evidence_missing",
      "Structured server OCR evidence is unavailable.",
      evidence,
    );
  }

  const confirmed = order.rx;
  const ocr = order.rx_ocr_raw;
  evidence.ocrConfidence = number(ocr.confidence);

  if (ocr.looks_like_contact_lens_rx !== true) {
    return review(
      "ocr_not_contact_lens_prescription",
      "OCR did not identify a contact-lens prescription.",
      evidence,
    );
  }
  if (
    evidence.ocrConfidence === null ||
    evidence.ocrConfidence < UPLOADED_RX_AUTO_VERIFY_MIN_CONFIDENCE
  ) {
    return review(
      "ocr_low_confidence",
      "OCR confidence is below the automated verification threshold.",
      evidence,
    );
  }
  if (text(ocr.notes)) {
    return review(
      "ocr_ambiguous",
      "OCR reported ambiguity or interpretive notes.",
      evidence,
    );
  }

  const confirmedExpiration = isoDate(confirmed.expires);
  const ocrExpiration = isoDate(ocr.expirationDate);
  evidence.expiration = ocrExpiration;
  if (!confirmedExpiration || !ocrExpiration) {
    return review(
      "ocr_missing_required_fields",
      "A valid expiration date was not extracted and confirmed.",
      evidence,
    );
  }
  if (confirmedExpiration !== ocrExpiration) {
    return review(
      "expiration_mismatch",
      "Confirmed and extracted expiration dates do not match.",
      evidence,
    );
  }
  if (!futureDate(ocrExpiration, now)) {
    return review("prescription_expired", "The prescription is expired.", evidence);
  }

  const confirmedPatient = normalizeName(order.patient_name);
  const ocrPatient = normalizeName(ocr.patient_name);
  if (!confirmedPatient || !ocrPatient) {
    return review(
      "patient_identity_missing",
      "Patient identity is missing from OCR or customer confirmation.",
      evidence,
    );
  }
  evidence.patientMatched = confirmedPatient === ocrPatient;
  if (!evidence.patientMatched) {
    return review(
      "patient_mismatch",
      "Confirmed patient identity does not match the upload.",
      evidence,
    );
  }

  const confirmedPrescriber = normalizePrescriberName(order.prescriber_name);
  const ocrPrescriber = normalizePrescriberName(ocr.doctor_name);
  if (!confirmedPrescriber || !ocrPrescriber) {
    return review(
      "prescriber_missing",
      "Prescriber identity is missing from OCR or customer confirmation.",
      evidence,
    );
  }
  evidence.prescriberMatched = confirmedPrescriber === ocrPrescriber;
  const confirmedPhone = normalizePhone(order.prescriber_phone);
  const ocrPhone = normalizePhone(ocr.prescriber_phone);
  if (
    !evidence.prescriberMatched ||
    (confirmedPhone && ocrPhone && confirmedPhone !== ocrPhone)
  ) {
    return review(
      "prescriber_mismatch",
      "Confirmed prescriber identity does not match the upload.",
      evidence,
    );
  }

  const topLevelBrand = text(ocr.brand_raw);
  const confirmedEyes = (["right", "left"] as const).filter((eyeName) =>
    isRecord(confirmed[eyeName]),
  );
  if (!confirmedEyes.length) {
    return review(
      "customer_confirmation_missing",
      "No eye prescription was confirmed.",
      evidence,
    );
  }

  for (const eyeName of confirmedEyes) {
    const confirmedEye = confirmed[eyeName];
    const ocrEye = ocr[eyeName];
    if (!isRecord(confirmedEye) || !isRecord(ocrEye)) {
      return review(
        "ocr_missing_required_fields",
        `${eyeName} eye is missing from OCR evidence.`,
        evidence,
      );
    }
    const mismatch = compareEye(
      eyeName,
      confirmedEye,
      ocrEye,
      topLevelBrand,
      evidence,
    );
    if (mismatch) return mismatch;
  }

  if (stripeStatus !== "requires_capture" && stripeStatus !== "succeeded") {
    return review(
      "payment_not_capturable",
      `Stripe PaymentIntent is not capturable (status: ${stripeStatus ?? "unknown"}).`,
      evidence,
    );
  }

  return { autoVerify: true, reason: "all_checks_passed", evidence };
}

export function uploadedRxReviewStatus(reason: UploadedRxExceptionReason): string {
  return `automation_review_${reason}`;
}

export async function runUploadedRxAutomation(
  order: UploadedRxAutomationOrder,
  stripeStatus: string | null | undefined,
  capture: () => Promise<UploadedRxCaptureResult>,
  now = new Date(),
): Promise<UploadedRxAutomationRun> {
  const decision = evaluateUploadedRxAutomation(order, stripeStatus, now);
  if (!decision.autoVerify) return { decision, capture: null };

  try {
    return { decision, capture: await capture() };
  } catch (error) {
    return {
      decision: {
        autoVerify: false,
        reason: "automation_capture_failed",
        detail:
          error instanceof Error ? error.message : "Automated capture failed.",
        evidence: decision.evidence,
      },
      capture: null,
    };
  }
}
