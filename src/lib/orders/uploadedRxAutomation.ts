import { lenses } from "@/LensCore";
import { resolveBrand } from "@/lib/resolveBrand";
import { hasUnresolvedProductMismatch } from "./productSelection";
import { prescriptionAddsEquivalent } from "./prescriptionAdd";
import { hasMultifocalProductSignal } from "./ocrPrescription";

export const UPLOADED_RX_AUTO_VERIFY_MIN_CONFIDENCE = 0.95;
export const UPLOADED_RX_CAPTURE_FAILURE_CODE = "uploaded_rx_capture_failed";

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
  id?: unknown;
  sku?: unknown;
  rx_ocr_meta?: unknown;
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
      errorCode?: string;
      evidence: UploadedRxAutomationEvidence;
    };

export type UploadedRxFinalizationOutcome =
  | {
      state: "auto_verified";
      writeVerificationOutcome: true;
      recordAutomationEvent: true;
    }
  | {
      state: "eligible_pending_capture";
      writeVerificationOutcome: false;
      recordAutomationEvent: false;
    }
  | {
      state: "review";
      writeVerificationOutcome: true;
      recordAutomationEvent: true;
    };

export type UploadedRxAutomationEvidence = {
  ocrConfidence: number | null;
  checkedEyes: Array<"right" | "left">;
  resolvedProducts: Partial<Record<"right" | "left", string>>;
  aiResolvedProducts: UploadedRxProductResolutions;
  productFallback: Partial<
    Record<"right" | "left", "resolved" | "no_candidates" | "no_match" | "error">
  >;
  expiration: string | null;
  patientMatched: boolean;
  prescriberMatched: boolean;
};

export type UploadedRxProductResolutions = Partial<
  Record<"right" | "left", { rawString: string; coreId: string }>
>;

export type UploadedRxProductResolver = (
  rawString: string,
  candidates: Array<{ coreId: string; label: string }>,
) => Promise<string | null>;

export type UploadedRxCaptureResult = {
  paymentIntentId: string;
  alreadyCaptured: boolean;
};

export function uploadedRxFinalizationOutcome(
  decision: UploadedRxAutomationDecision,
  capture: UploadedRxCaptureResult | null,
): UploadedRxFinalizationOutcome {
  if (!decision.autoVerify) {
    return {
      state: "review",
      writeVerificationOutcome: true,
      recordAutomationEvent: true,
    };
  }
  if (!capture) {
    return {
      state: "eligible_pending_capture",
      writeVerificationOutcome: false,
      recordAutomationEvent: false,
    };
  }
  return {
    state: "auto_verified",
    writeVerificationOutcome: true,
    recordAutomationEvent: true,
  };
}

export function isCompletedUploadedRxFinalization(
  orderStatus: string | null,
  verificationStatus: string | null,
  rxStatus: string | null,
): boolean {
  return (
    orderStatus === "captured" &&
    verificationStatus === "auto_verified" &&
    rxStatus === "auto_verified"
  );
}

export function isPersistedUploadedRxReview(
  orderStatus: string | null,
  verificationStatus: string | null,
  rxStatus: string | null,
): boolean {
  return (
    orderStatus === "authorized" &&
    (verificationStatus === "requires_review" ||
      verificationStatus === "information_needed") &&
    Boolean(rxStatus?.startsWith("automation_review_"))
  );
}

export function uploadedRxFinalizationAllowedOrderStatuses(
  orderStatus: string,
  nextStatus: string,
  outcome: UploadedRxFinalizationOutcome | null,
): string[] {
  const statuses = new Set([orderStatus, nextStatus]);
  if (outcome?.state === "auto_verified") statuses.add("authorized");
  return [...statuses];
}

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

function hasToricSignal(eye: UnknownRecord): boolean {
  const cylinder = number(eye.cylinder);
  const axis = number(eye.axis);
  return (
    (cylinder !== null && Math.abs(cylinder) > 0.001) ||
    (axis !== null && Math.abs(axis) > 0.001)
  );
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

/**
 * OCR providers attach useful explanatory notes (for example, that a
 * spectacle prescription was ignored) to otherwise clean extractions.  Only
 * a note that names an unreadable or uncertain prescription field is an
 * automation blocker.
 */
function hasMaterialOcrAmbiguity(value: unknown): boolean {
  const note = text(value);
  if (!note) return false;

  return /\b(?:ambiguous|uncertain|illegible|unreadable|cannot determine|unable to determine)\b/i.test(
    note,
  );
}

function emptyEvidence(): UploadedRxAutomationEvidence {
  return {
    ocrConfidence: null,
    checkedEyes: [],
    resolvedProducts: {},
    aiResolvedProducts: {},
    productFallback: {},
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
  productResolutions: UploadedRxProductResolutions,
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

  if (!lens.type.toric && hasToricSignal(ocrEye)) {
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
      hasCyl: hasToricSignal(ocrEye),
      hasAdd:
        text(ocrEye.add) !== null || hasMultifocalProductSignal(brandRaw),
      bc: number(ocrEye.baseCurve),
      dia: number(ocrEye.diameter),
    },
    lenses,
  );
  const deterministicallyResolvedLens = resolved.lensId
    ? lenses.find((candidate) => candidate.coreId === resolved.lensId)
    : null;
  const exactCatalogName = Boolean(
    deterministicallyResolvedLens &&
      normalizeProductName(brandRaw) ===
        normalizeProductName(deterministicallyResolvedLens.displayName),
  );
  let resolvedLensId =
    resolved.lensId && (resolved.confidence === "high" || exactCatalogName)
      ? resolved.lensId
      : null;
  if (!resolvedLensId) {
    const aiResolution = productResolutions[eyeName];
    if (aiResolution?.rawString === brandRaw) {
      resolvedLensId = aiResolution.coreId;
      evidence.aiResolvedProducts[eyeName] = aiResolution;
    }
  }
  if (!resolvedLensId) {
    return review(
      "product_unresolved",
      `${eyeName} eye product could not be resolved with high confidence.`,
      evidence,
    );
  }
  evidence.resolvedProducts[eyeName] = resolvedLensId;
  if (resolvedLensId !== coreId) {
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
    if (!prescriptionAddsEquivalent(confirmedEye.add, ocrEye.add)) {
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
  productResolutions: UploadedRxProductResolutions = {},
): UploadedRxAutomationDecision {
  const evidence = emptyEvidence();

  if (!text(order.rx_upload_path)) {
    return review("missing_upload_evidence", "No retained upload exists.", evidence);
  }
  if (hasUnresolvedProductMismatch(order)) {
    return review("product_mismatch", "Selected and prescribed products require explicit resolution.", evidence);
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
  if (hasMaterialOcrAmbiguity(ocr.notes)) {
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
  // Identity is corroborating evidence, not an OCR field that every valid
  // prescription contains. A real conflict must stop automation; an absent
  // field must not turn an otherwise exact, customer-confirmed one-eye Rx
  // into a founder review.
  evidence.patientMatched = Boolean(
    confirmedPatient && ocrPatient && confirmedPatient === ocrPatient,
  );
  if (confirmedPatient && ocrPatient && !evidence.patientMatched) {
    return review(
      "patient_mismatch",
      "Confirmed patient identity does not match the upload.",
      evidence,
    );
  }

  const confirmedPrescriber = normalizePrescriberName(order.prescriber_name);
  const ocrPrescriber = normalizePrescriberName(ocr.doctor_name);
  evidence.prescriberMatched = Boolean(
    confirmedPrescriber &&
      ocrPrescriber &&
      confirmedPrescriber === ocrPrescriber,
  );
  const confirmedPhone = normalizePhone(order.prescriber_phone);
  const ocrPhone = normalizePhone(ocr.prescriber_phone);
  if (
    (confirmedPrescriber && ocrPrescriber && !evidence.prescriberMatched) ||
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
      productResolutions,
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

function clinicallyCompatibleProductCandidates(
  ocrEye: UnknownRecord,
  brandRaw: string,
): Array<{ coreId: string; label: string }> {
  const hasCyl = hasToricSignal(ocrEye);
  const hasAdd =
    text(ocrEye.add) !== null || hasMultifocalProductSignal(brandRaw);
  const baseCurve = number(ocrEye.baseCurve);
  const diameter = number(ocrEye.diameter);

  return lenses
    .filter(
      (lens) =>
        lens.type.toric === hasCyl &&
        lens.type.multifocal === hasAdd &&
        (baseCurve === null ||
          (lens.parameters.baseCurve ?? []).includes(baseCurve)) &&
        (diameter === null ||
          (lens.parameters.diameter ?? []).includes(diameter)),
    )
    .map((lens) => ({ coreId: lens.coreId, label: lens.displayName.trim() }));
}

export async function evaluateUploadedRxAutomationWithProductFallback(
  order: UploadedRxAutomationOrder,
  stripeStatus: string | null | undefined,
  resolveProduct: UploadedRxProductResolver,
  now = new Date(),
): Promise<UploadedRxAutomationDecision> {
  const deterministic = evaluateUploadedRxAutomation(order, stripeStatus, now);
  if (deterministic.autoVerify || deterministic.reason !== "product_unresolved") {
    return deterministic;
  }
  if (!isRecord(order.rx) || !isRecord(order.rx_ocr_raw)) return deterministic;

  const confirmed = order.rx;
  const ocr = order.rx_ocr_raw;
  const topLevelBrand = text(ocr.brand_raw);
  const productResolutions: UploadedRxProductResolutions = {};

  for (const eyeName of ["right", "left"] as const) {
    const confirmedEye = confirmed[eyeName];
    const ocrEye = ocr[eyeName];
    if (!isRecord(confirmedEye) || !isRecord(ocrEye)) continue;

    const brandRaw = text(ocrEye.brand_raw) ?? topLevelBrand;
    if (!brandRaw) continue;
    const resolved = resolveBrand(
      {
        rawString: brandRaw,
        hasCyl: hasToricSignal(ocrEye),
        hasAdd:
          text(ocrEye.add) !== null || hasMultifocalProductSignal(brandRaw),
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
    if (resolved.lensId && (resolved.confidence === "high" || exactCatalogName)) {
      continue;
    }

    const candidates = clinicallyCompatibleProductCandidates(ocrEye, brandRaw);
    if (!candidates.length) {
      deterministic.evidence.productFallback[eyeName] = "no_candidates";
      continue;
    }
    try {
      const coreId = await resolveProduct(brandRaw, candidates);
      if (coreId && candidates.some((candidate) => candidate.coreId === coreId)) {
        productResolutions[eyeName] = { rawString: brandRaw, coreId };
        deterministic.evidence.productFallback[eyeName] = "resolved";
      } else {
        deterministic.evidence.productFallback[eyeName] = "no_match";
      }
    } catch (error) {
      deterministic.evidence.productFallback[eyeName] = "error";
      console.error("Uploaded-Rx product fallback failed", {
        orderId: text(order.id) ?? "unknown",
        error: error instanceof Error ? error.message : "Unknown resolver failure",
      });
      return deterministic;
    }
  }

  if (!Object.keys(productResolutions).length) return deterministic;
  const reevaluated = evaluateUploadedRxAutomation(
    order,
    stripeStatus,
    now,
    productResolutions,
  );
  reevaluated.evidence.productFallback = {
    ...deterministic.evidence.productFallback,
  };
  return reevaluated;
}

export function uploadedRxReviewStatus(reason: UploadedRxExceptionReason): string {
  return `automation_review_${reason}`;
}

export function uploadedRxFailureStage(
  reason: UploadedRxExceptionReason,
): string {
  if (reason === "missing_upload_evidence") return "upload_evidence";
  if (reason === "customer_confirmation_missing") return "customer_confirmation";
  if (reason.startsWith("ocr_")) return "ocr_extraction";
  if (reason === "prescription_expired" || reason === "expiration_mismatch") {
    return "expiration_validation";
  }
  if (reason.startsWith("patient_") || reason.startsWith("prescriber_")) {
    return "identity_validation";
  }
  if (reason === "product_unresolved" || reason === "product_mismatch") {
    return "product_matching";
  }
  if (reason === "parameter_mismatch") return "parameter_validation";
  if (reason === "payment_not_capturable") return "payment_readiness";
  if (reason === "automation_capture_failed") return "payment_capture";
  return "state_persistence";
}

export async function runUploadedRxAutomation(
  order: UploadedRxAutomationOrder,
  stripeStatus: string | null | undefined,
  capture: (
    decision: Extract<UploadedRxAutomationDecision, { autoVerify: true }>,
  ) => Promise<UploadedRxCaptureResult>,
  now = new Date(),
  resolveProduct?: UploadedRxProductResolver,
): Promise<UploadedRxAutomationRun> {
  const decision = resolveProduct
    ? await evaluateUploadedRxAutomationWithProductFallback(
        order,
        stripeStatus,
        resolveProduct,
        now,
      )
    : evaluateUploadedRxAutomation(order, stripeStatus, now);
  if (!decision.autoVerify) return { decision, capture: null };

  try {
    return { decision, capture: await capture(decision) };
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Automated capture failed.";
    const errorCode =
      isRecord(error) && typeof error.code === "string" && error.code.trim()
        ? error.code.trim()
        : UPLOADED_RX_CAPTURE_FAILURE_CODE;
    console.error("Uploaded-Rx automatic capture failed", {
      orderId: text(order.id) ?? "unknown",
      errorCode,
      detail,
    });
    return {
      decision: {
        autoVerify: false,
        reason: "automation_capture_failed",
        detail,
        errorCode,
        evidence: decision.evidence,
      },
      capture: null,
    };
  }
}
