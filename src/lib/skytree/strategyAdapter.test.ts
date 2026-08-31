import assert from "node:assert/strict";

import {
  buildPrivacySafeSkytreeResult,
  importSkytreePattern,
  mayImplementExperiment,
} from "./strategyAdapter";

const neutralExport: unknown = {
  contract_version: "1.0.0",
  export_id: "synthetic-honest-lenses-adapter-fixture",
  producer: "seo_skytree",
  generated_at: "2026-08-31T14:00:00Z",
  patterns: [
    {
      pattern_id: "category-hierarchy",
      version: "1.0.0-fixture.1",
      description: "Clear category relationships support product discovery.",
      status: "supported",
      confidence: 0.72,
      supporting_observations: [
        {
          observation_id: "synthetic-observation-1",
          source_url: "https://example.invalid/source-1",
          evidence_type: "synthetic_fixture",
          observed_at: "2026-08-28T12:00:00Z",
          limitations: ["Synthetic fixture"],
        },
        {
          observation_id: "synthetic-observation-2",
          source_url: "https://example.invalid/source-2",
          evidence_type: "synthetic_fixture",
          observed_at: "2026-08-29T12:00:00Z",
          limitations: ["Synthetic fixture"],
        },
        {
          observation_id: "synthetic-observation-3",
          source_url: "https://example.invalid/source-3",
          evidence_type: "synthetic_fixture",
          observed_at: "2026-08-30T12:00:00Z",
          limitations: ["Synthetic fixture"],
        },
      ],
    },
  ],
};
const beforeImport = JSON.stringify(neutralExport);

const context = {
  evidenceStrength: 64,
  expectedRevenueImpact: 70,
  seoUpside: 76,
  implementationEffort: 32,
  regulatoryRisk: 28,
  timeToSignal: 45,
  catalogFit: 82,
  searchDemandFit: 74,
  productPageFit: 88,
  buyingJourneyFit: 80,
  adaptedHypothesis:
    "A visible category hierarchy aligned with canonical product relationships may improve aggregate product-navigation completion without changing regulated product claims.",
  baseline: "Aggregate product-navigation completion before an approved experiment.",
  targetMetric: "Aggregate product-navigation completion rate.",
};

const first = importSkytreePattern(neutralExport, context, {
  asOf: "2026-08-31T15:00:00Z",
});
const second = importSkytreePattern(neutralExport, context, {
  asOf: "2026-08-31T15:00:00Z",
});

assert.deepEqual(first, second, "Import must be idempotent.");
assert.equal(JSON.stringify(neutralExport), beforeImport, "Import must not mutate the source export.");
assert.equal(first.source.patternVersion, "1.0.0-fixture.1");
assert.equal(first.approvalStatus, "pending");
assert.equal(first.implementationStatus, "blocked_pending_approval");
assert.equal(first.publicationStatus, "not_requested");
assert.equal(first.decision, "pending");
assert.equal(mayImplementExperiment(first), false);
assert.ok(first.scores.priority >= 0 && first.scores.priority <= 100);
assert.equal(first.source.provenance.length, 3);

const inconclusiveResult = buildPrivacySafeSkytreeResult(first, {
  decision: "inconclusive",
  status: "completed",
  aggregateMetrics: {
    treatment_sessions: 120,
    control_sessions: 118,
    treatment_completion_rate: 0.42,
    control_completion_rate: 0.41,
  },
  limitations: ["Synthetic fixture", "No causal conclusion"],
});
assert.equal(inconclusiveResult.decision, "inconclusive");
assert.equal(inconclusiveResult.containsPersonalData, false);
assert.equal(inconclusiveResult.containsPrescriptionData, false);
assert.equal(inconclusiveResult.containsPaymentData, false);

assert.throws(() =>
  buildPrivacySafeSkytreeResult(first, {
    decision: "keep",
    status: "completed",
    aggregateMetrics: { order_id: 123 },
    limitations: [],
  }),
);

const staleExport = JSON.parse(beforeImport) as Record<string, unknown>;
staleExport.generated_at = "2020-01-01T00:00:00Z";
assert.throws(() =>
  importSkytreePattern(staleExport, context, { asOf: "2026-08-31T15:00:00Z" }),
);

const lowConfidence = JSON.parse(beforeImport) as { patterns: Array<Record<string, unknown>> };
lowConfidence.patterns[0].confidence = 0.1;
assert.throws(() =>
  importSkytreePattern(lowConfidence, context, { asOf: "2026-08-31T15:00:00Z" }),
);

console.log("Skytree strategy adapter tests passed");
