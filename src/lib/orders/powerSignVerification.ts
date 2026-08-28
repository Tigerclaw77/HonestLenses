export type PrescriptionEyeName = "right" | "left";
export type PrescriptionPowerField = "sphere" | "cylinder";

type UnknownRecord = Record<string, unknown>;

export type PowerCellEvidence = {
  raw_text?: unknown;
  value?: unknown;
};

export type PowerEvidenceByEye = Partial<
  Record<PrescriptionPowerField, PowerCellEvidence | null>
>;

export type PowerSignImageRecheck = Partial<
  Record<PrescriptionEyeName, PowerEvidenceByEye | null>
>;

export type PowerSignCheckResult = {
  status: "agree" | "non_informative" | "contradict";
  detail: string;
};

export type PowerSignFieldVerification = {
  eye: PrescriptionEyeName;
  field: PrescriptionPowerField;
  candidate_value: number | null;
  raw_ocr: string | null;
  primary_parser: PowerSignCheckResult;
  raw_ocr_check: PowerSignCheckResult;
  secondary_parser: PowerSignCheckResult;
  image_region: PowerSignCheckResult;
  clinical_structural: PowerSignCheckResult;
  status: "high_confidence" | "needs_manual_review";
};

export type PowerSignVerification = {
  version: 1;
  fields: PowerSignFieldVerification[];
  has_manual_review: boolean;
};

type ParsedPower =
  | { kind: "value"; value: number; explicitSign: "negative" | "positive" | "none" }
  | { kind: "ds" | "plano" }
  | { kind: "unreadable" };

const NEGATIVE_SIGNS = "\\-\\u2212\\u2010\\u2011\\u2012\\u2013\\u2014\\ufe63\\uff0d";
const POWER_TOKEN = new RegExp(
  `([+${NEGATIVE_SIGNS}]?)\\s*(\\d{1,2}(?:\\.\\d{1,2})?|\\.\\d{1,2})`,
  "g",
);

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function samePower(left: number | null, right: number | null): boolean {
  return (
    left !== null &&
    right !== null &&
    Math.abs(left - right) < 0.001 &&
    (Object.is(left, -0) === Object.is(right, -0) || left !== 0 || right === 0)
  );
}

function cellEvidence(
  source: unknown,
  eye: PrescriptionEyeName,
  field: PrescriptionPowerField,
): PowerCellEvidence | null {
  if (!isRecord(source) || !isRecord(source[eye])) return null;
  const cell = source[eye][field];
  return isRecord(cell) ? cell : null;
}

function hasEyeLabel(raw: string, eye: PrescriptionEyeName): boolean {
  return eye === "right"
    ? /\b(?:od|right)\b/i.test(raw)
    : /\b(?:os|left)\b/i.test(raw);
}

function hasFieldLabel(raw: string, field: PrescriptionPowerField): boolean {
  return field === "sphere"
    ? /\b(?:sph|sphere)\b/i.test(raw)
    : /\b(?:cyl|cylinder)\b/i.test(raw);
}

function parseExactPrintedPower(raw: string): ParsedPower {
  const matches = [...raw.matchAll(POWER_TOKEN)];
  const token = matches.at(-1);
  if (token) {
    const magnitude = Number(token[2]);
    if (Number.isFinite(magnitude)) {
      const glyph = token[1] ?? "";
      return {
        kind: "value",
        value: glyph && glyph !== "+" ? -magnitude : magnitude,
        explicitSign:
          glyph === "+" ? "positive" : glyph ? "negative" : "none",
      };
    }
  }
  if (/\b(?:d\.?s\.?|diopt(?:er|re)s?\s+sphere)\b/i.test(raw)) {
    return { kind: "ds" };
  }
  if (/\b(?:plano|pl)\b/i.test(raw)) return { kind: "plano" };
  return { kind: "unreadable" };
}

/** A deliberately separate normalization path for persisted raw OCR evidence. */
export function parsePowerWithIndependentNormalizer(raw: string): ParsedPower {
  const normalized = raw
    .replace(/[\u2212\u2010\u2011\u2012\u2013\u2014\ufe63\uff0d]/g, "-")
    .replace(/\s+/g, " ");
  const candidates = [
    ...normalized.matchAll(/([+-]?)(?:\s*)(\d{1,2}(?:\.\d{1,2})?|\.\d{1,2})/g),
  ];
  const candidate = candidates.at(-1);
  if (candidate) {
    const magnitude = Number(candidate[2]);
    if (Number.isFinite(magnitude)) {
      return {
        kind: "value",
        value: candidate[1] === "-" ? -magnitude : magnitude,
        explicitSign:
          candidate[1] === "-"
            ? "negative"
            : candidate[1] === "+"
              ? "positive"
              : "none",
      };
    }
  }
  if (/\b(?:d\.?s\.?|diopt(?:er|re)s?\s+sphere)\b/i.test(normalized)) {
    return { kind: "ds" };
  }
  if (/\b(?:plano|pl)\b/i.test(normalized)) return { kind: "plano" };
  return { kind: "unreadable" };
}

function candidateMatchesParsed(candidate: number | null, parsed: ParsedPower): boolean {
  if (candidate === null) return parsed.kind === "ds" || parsed.kind === "plano";
  if (parsed.kind !== "value" || !samePower(candidate, parsed.value)) return false;
  // A non-zero positive value must have an explicit plus sign. This prevents a
  // dropped minus glyph from ever becoming an automatically accepted positive.
  return candidate <= 0 || parsed.explicitSign === "positive";
}

function evidenceCheck(
  raw: string | null,
  candidate: number | null,
  eye: PrescriptionEyeName,
  field: PrescriptionPowerField,
  parser: (value: string) => ParsedPower,
  parserName: string,
): PowerSignCheckResult {
  if (!raw) return { status: "contradict", detail: `${parserName} raw evidence is missing.` };
  if (!hasEyeLabel(raw, eye) || !hasFieldLabel(raw, field)) {
    return {
      status: "contradict",
      detail: `${parserName} evidence is not tied to the ${eye} ${field} cell.`,
    };
  }
  const parsed = parser(raw);
  if (parsed.kind === "unreadable") {
    return { status: "contradict", detail: `${parserName} could not read the displayed value.` };
  }
  if (!candidateMatchesParsed(candidate, parsed)) {
    return {
      status: "contradict",
      detail: `${parserName} does not match the primary value or sign.`,
    };
  }
  return { status: "agree", detail: `${parserName} matches the primary value and sign.` };
}

function imageRegionCheck(
  recheck: PowerCellEvidence | null,
  candidate: number | null,
  eye: PrescriptionEyeName,
  field: PrescriptionPowerField,
): PowerSignCheckResult {
  const raw = text(recheck?.raw_text);
  const rereadValue = finiteNumber(recheck?.value);
  if (!raw && rereadValue === null) {
    return { status: "non_informative", detail: "Image-region recheck returned no usable cell evidence." };
  }
  if (!raw || !hasEyeLabel(raw, eye) || !hasFieldLabel(raw, field)) {
    return { status: "contradict", detail: "Image-region recheck is not tied to the expected table cell." };
  }
  const parsed = parseExactPrintedPower(raw);
  if (!candidateMatchesParsed(candidate, parsed)) {
    return { status: "contradict", detail: "Image-region recheck disagrees with the primary value or sign." };
  }
  if (candidate === null) {
    if (rereadValue !== null) {
      return { status: "contradict", detail: "Image-region recheck found a numeric value where DS/plano was expected." };
    }
  } else if (!samePower(candidate, rereadValue)) {
    return { status: "contradict", detail: "Image-region recheck numeric result disagrees with the primary value or sign." };
  }
  return { status: "agree", detail: "Image-region recheck matches the displayed value and sign." };
}

function clinicalCheck(
  candidate: number | null,
  raw: string | null,
  eye: PrescriptionEyeName,
  field: PrescriptionPowerField,
  primaryEyes: UnknownRecord,
  rawEvidence: unknown,
): PowerSignCheckResult {
  if (!raw || !hasEyeLabel(raw, eye) || !hasFieldLabel(raw, field)) {
    return { status: "contradict", detail: "Clinical check cannot establish the eye and column." };
  }
  if (candidate === null) {
    const parsed = parseExactPrintedPower(raw);
    if (field === "cylinder" && (parsed.kind === "ds" || parsed.kind === "plano")) {
      return { status: "agree", detail: "DS/plano is correctly treated as no cylinder." };
    }
    return { status: "contradict", detail: "A missing power is not supported by the printed cell." };
  }
  const limit = field === "sphere" ? 20 : 10;
  if (Math.abs(candidate) > limit) {
    return { status: "contradict", detail: `${field} is outside plausible contact-lens power bounds.` };
  }
  const parsed = parseExactPrintedPower(raw);
  if (parsed.kind !== "value" || !candidateMatchesParsed(candidate, parsed)) {
    return { status: "contradict", detail: "Clinical structure would not preserve the displayed sign." };
  }
  const otherEye: PrescriptionEyeName = eye === "right" ? "left" : "right";
  const otherCandidate = isRecord(primaryEyes[otherEye])
    ? finiteNumber(primaryEyes[otherEye][field])
    : null;
  const otherRaw = text(cellEvidence(rawEvidence, otherEye, field)?.raw_text);
  const otherParsed = otherRaw ? parseExactPrintedPower(otherRaw) : null;
  if (
    otherCandidate !== null &&
    otherParsed?.kind === "value" &&
    samePower(parsed.value, otherParsed.value) &&
    !samePower(candidate, otherCandidate)
  ) {
    return {
      status: "contradict",
      detail: "OD/OS raw evidence agrees but the normalized signed outputs diverge.",
    };
  }
  return { status: "agree", detail: "Eye, column, sign, and clinical power range are consistent." };
}

function primaryParserCheck(candidate: number | null): PowerSignCheckResult {
  if (candidate === null) {
    return { status: "agree", detail: "Primary parser reports DS/plano/no cylinder." };
  }
  return { status: "agree", detail: "Primary OCR parser produced a finite signed power." };
}

function fieldVerification(
  eye: PrescriptionEyeName,
  field: PrescriptionPowerField,
  primaryEyes: UnknownRecord,
  rawEvidence: unknown,
  imageRecheck: unknown,
): PowerSignFieldVerification | null {
  const primaryEye = isRecord(primaryEyes[eye]) ? primaryEyes[eye] : null;
  const candidate = finiteNumber(primaryEye?.[field]);
  const primaryCell = cellEvidence(rawEvidence, eye, field);
  const imageCell = cellEvidence(imageRecheck, eye, field);
  const raw = text(primaryCell?.raw_text);
  if (candidate === null && !raw && !imageCell) return null;

  const primaryParser = primaryParserCheck(candidate);
  const rawOcr = evidenceCheck(raw, candidate, eye, field, parseExactPrintedPower, "Raw OCR check");
  const secondaryParser = evidenceCheck(
    raw,
    candidate,
    eye,
    field,
    parsePowerWithIndependentNormalizer,
    "Independent parser",
  );
  const imageRegion = imageRegionCheck(imageCell, candidate, eye, field);
  const clinicalStructural = clinicalCheck(
    candidate,
    raw,
    eye,
    field,
    primaryEyes,
    rawEvidence,
  );
  const checks = [rawOcr, secondaryParser, imageRegion, clinicalStructural];
  const contradictions = checks.some((check) => check.status === "contradict");
  const agreements = checks.filter((check) => check.status === "agree").length;
  const status = !contradictions && agreements >= 3 ? "high_confidence" : "needs_manual_review";

  return {
    eye,
    field,
    candidate_value: candidate,
    raw_ocr: raw,
    primary_parser: primaryParser,
    raw_ocr_check: rawOcr,
    secondary_parser: {
      status: secondaryParser.status,
      detail: secondaryParser.detail,
    },
    image_region: imageRegion,
    clinical_structural: clinicalStructural,
    status,
  };
}

export function buildPowerSignVerification(
  interpretation: unknown,
  imageRecheck: PowerSignImageRecheck | null,
): PowerSignVerification {
  const source = isRecord(interpretation) ? interpretation : {};
  const rawEvidence = source.power_evidence;
  const fields = (['right', 'left'] as const).flatMap((eye) => {
    return (['sphere', 'cylinder'] as const)
      .map((field) => fieldVerification(eye, field, source, rawEvidence, imageRecheck))
      .filter((value): value is PowerSignFieldVerification => value !== null);
  });
  return {
    version: 1,
    fields,
    has_manual_review: fields.some((field) => field.status === "needs_manual_review"),
  };
}

export function hasPowerSignManualReview(value: unknown): boolean {
  return isRecord(value) && value.has_manual_review === true;
}
