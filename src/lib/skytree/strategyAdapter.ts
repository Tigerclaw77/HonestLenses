export type StrategyScoreInputs = {
  evidenceStrength: number;
  expectedRevenueImpact: number;
  seoUpside: number;
  implementationEffort: number;
  regulatoryRisk: number;
  timeToSignal: number;
};

export type HonestLensesStrategyContext = StrategyScoreInputs & {
  catalogFit: number;
  searchDemandFit: number;
  productPageFit: number;
  buyingJourneyFit: number;
  adaptedHypothesis: string;
  baseline: string;
  targetMetric: string;
};

export type ExperimentDecision = "pending" | "keep" | "revise" | "discard" | "inconclusive";

export type HonestLensesExperimentCandidate = {
  experimentId: string;
  source: {
    exportId: string;
    contractVersion: string;
    patternId: string;
    patternVersion: string;
    patternStatus: string;
    provenance: Array<{
      observationId: string;
      sourceUrl: string;
      evidenceType: string;
      observedAt: string;
      limitations: string[];
    }>;
  };
  observedTactic: string;
  adaptedHypothesis: string;
  scores: StrategyScoreInputs & {
    catalogFit: number;
    searchDemandFit: number;
    productPageFit: number;
    buyingJourneyFit: number;
    priority: number;
  };
  approvalStatus: "pending";
  implementationStatus: "blocked_pending_approval";
  publicationStatus: "not_requested";
  baseline: string;
  targetMetric: string;
  result: null;
  decision: "pending";
};

const FORBIDDEN_RESULT_KEYS = new Set([
  "customer_id",
  "customer_name",
  "email",
  "phone",
  "address",
  "order_id",
  "payment_id",
  "prescription",
  "prescription_values",
]);

export function importSkytreePattern(
  exportPayload: unknown,
  context: HonestLensesStrategyContext,
  options: { asOf: string; maxAgeDays?: number; minimumConfidence?: number },
): HonestLensesExperimentCandidate {
  const payload = asRecord(exportPayload, "Skytree export");
  requireString(payload.contract_version, "contract_version");
  requireString(payload.export_id, "export_id");
  if (payload.producer !== "seo_skytree") {
    throw new Error("Skytree export producer is invalid.");
  }
  const generatedAt = parseTimestamp(payload.generated_at, "generated_at");
  const asOf = parseTimestamp(options.asOf, "asOf");
  const ageDays = (asOf.getTime() - generatedAt.getTime()) / 86_400_000;
  if (ageDays < 0 || ageDays > (options.maxAgeDays ?? 365)) {
    throw new Error("Skytree export is future-dated or stale.");
  }

  if (!Array.isArray(payload.patterns) || payload.patterns.length !== 1) {
    throw new Error("The bounded adapter requires exactly one Pattern.");
  }
  const pattern = asRecord(payload.patterns[0], "Pattern");
  const confidence = boundedScore(Number(pattern.confidence) * 100, "Pattern confidence") / 100;
  if (confidence < (options.minimumConfidence ?? 0.5)) {
    throw new Error("Pattern confidence is below the consumer threshold.");
  }
  const patternId = requireString(pattern.pattern_id, "pattern_id");
  const patternVersion = requireString(pattern.version, "pattern.version");
  const observedTactic = requireString(pattern.description, "pattern.description");
  const patternStatus = requireString(pattern.status, "pattern.status");
  if (!["candidate", "supported", "disputed"].includes(patternStatus)) {
    throw new Error(`Pattern status ${patternStatus} is not importable.`);
  }
  if (!Array.isArray(pattern.supporting_observations) || pattern.supporting_observations.length < 2) {
    throw new Error("Pattern lacks multi-source supporting observations.");
  }

  const scores = normalizeContext(context);
  const priority = Math.round(
    scores.evidenceStrength * 0.2 +
      scores.expectedRevenueImpact * 0.2 +
      scores.seoUpside * 0.15 +
      scores.catalogFit * 0.1 +
      scores.searchDemandFit * 0.1 +
      scores.productPageFit * 0.075 +
      scores.buyingJourneyFit * 0.075 +
      (100 - scores.implementationEffort) * 0.035 +
      (100 - scores.regulatoryRisk) * 0.035 +
      (100 - scores.timeToSignal) * 0.035,
  );

  const provenance = pattern.supporting_observations.map((value, index) => {
    const observation = asRecord(value, `supporting_observations[${index}]`);
    return {
      observationId: requireString(observation.observation_id, "observation_id"),
      sourceUrl: requireString(observation.source_url, "source_url"),
      evidenceType: requireString(observation.evidence_type, "evidence_type"),
      observedAt: requireString(observation.observed_at, "observed_at"),
      limitations: requireStringArray(observation.limitations, "limitations"),
    };
  });

  const experimentId = `hl-experiment-${stableHash(
    `${patternId}@${patternVersion}:${context.adaptedHypothesis}`,
  )}`;
  return {
    experimentId,
    source: {
      exportId: requireString(payload.export_id, "export_id"),
      contractVersion: requireString(payload.contract_version, "contract_version"),
      patternId,
      patternVersion,
      patternStatus,
      provenance,
    },
    observedTactic,
    adaptedHypothesis: requireString(context.adaptedHypothesis, "adaptedHypothesis"),
    scores: { ...scores, priority },
    approvalStatus: "pending",
    implementationStatus: "blocked_pending_approval",
    publicationStatus: "not_requested",
    baseline: requireString(context.baseline, "baseline"),
    targetMetric: requireString(context.targetMetric, "targetMetric"),
    result: null,
    decision: "pending",
  };
}

export function mayImplementExperiment(candidate: HonestLensesExperimentCandidate): boolean {
  return candidate.approvalStatus === ("approved" as never);
}

export function buildPrivacySafeSkytreeResult(
  candidate: HonestLensesExperimentCandidate,
  input: {
    decision: Exclude<ExperimentDecision, "pending">;
    status: "completed" | "stopped";
    aggregateMetrics: Record<string, number>;
    limitations: string[];
  },
) {
  for (const [key, value] of Object.entries(input.aggregateMetrics)) {
    if (FORBIDDEN_RESULT_KEYS.has(key.toLowerCase())) {
      throw new Error(`Sensitive result field is forbidden: ${key}`);
    }
    if (!Number.isFinite(value)) {
      throw new Error(`Aggregate metric must be a finite number: ${key}`);
    }
  }
  return {
    object: "downstream_experiment_evidence",
    consumer: "honest_lenses_strategy",
    experimentId: candidate.experimentId,
    sourcePattern: {
      patternId: candidate.source.patternId,
      version: candidate.source.patternVersion,
    },
    decision: input.decision,
    status: input.status,
    aggregateMetrics: { ...input.aggregateMetrics },
    limitations: [...input.limitations],
    containsPersonalData: false,
    containsPrescriptionData: false,
    containsPaymentData: false,
  };
}

function normalizeContext(context: HonestLensesStrategyContext) {
  return {
    evidenceStrength: boundedScore(context.evidenceStrength, "evidenceStrength"),
    expectedRevenueImpact: boundedScore(context.expectedRevenueImpact, "expectedRevenueImpact"),
    seoUpside: boundedScore(context.seoUpside, "seoUpside"),
    implementationEffort: boundedScore(context.implementationEffort, "implementationEffort"),
    regulatoryRisk: boundedScore(context.regulatoryRisk, "regulatoryRisk"),
    timeToSignal: boundedScore(context.timeToSignal, "timeToSignal"),
    catalogFit: boundedScore(context.catalogFit, "catalogFit"),
    searchDemandFit: boundedScore(context.searchDemandFit, "searchDemandFit"),
    productPageFit: boundedScore(context.productPageFit, "productPageFit"),
    buyingJourneyFit: boundedScore(context.buyingJourneyFit, "buyingJourneyFit"),
  };
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function requireStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${label} must be an array of strings.`);
  }
  return [...value];
}

function parseTimestamp(value: unknown, label: string): Date {
  const parsed = new Date(requireString(value, label));
  if (Number.isNaN(parsed.getTime())) throw new Error(`${label} is not a valid timestamp.`);
  return parsed;
}

function boundedScore(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`${label} must be between 0 and 100.`);
  }
  return value;
}

function stableHash(value: string): string {
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    left = Math.imul(left ^ code, 0x01000193) >>> 0;
    right = Math.imul(right ^ code, 0x85ebca6b) >>> 0;
  }
  return `${left.toString(16).padStart(8, "0")}${right.toString(16).padStart(8, "0")}`;
}
