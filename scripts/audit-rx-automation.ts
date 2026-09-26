import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import {
  evaluateUploadedRxAutomation,
  uploadedRxFailureStage,
  type UploadedRxExceptionReason,
} from "@/lib/orders/uploadedRxAutomation";
import { assessOcrProductRequirements } from "@/lib/orders/ocrProductRequirements";
import { selectedProduct } from "@/lib/orders/productSelection";
import type { OcrPrescriptionInterpretation } from "@/lib/orders/ocrPrescription";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) {
  throw new Error("Production Rx audit requires configured Supabase credentials.");
}

const db = createClient(url, key, { auth: { persistSession: false } });
const requestedSize = process.argv
  .slice(2)
  .map(Number)
  .find((value) => Number.isFinite(value));
const sampleSize = Math.max(1, Math.min(requestedSize ?? 50, 100));
const includeRecords = !process.argv.includes("--summary");

type AuditEvent = {
  order_id: string;
  event_type: string;
  message: string | null;
  after: Record<string, unknown> | null;
  created_at: string;
};

type AuditOrder = Record<string, unknown> & {
  id: string;
  created_at: string;
  rx_status?: string | null;
  verification_status?: string | null;
};

function anonymizedOrderKey(id: string): string {
  return createHash("sha256").update(id).digest("hex").slice(0, 12);
}

function reasonFromOrder(order: AuditOrder): UploadedRxExceptionReason | null {
  const prefix = "automation_review_";
  return typeof order.rx_status === "string" && order.rx_status.startsWith(prefix)
    ? (order.rx_status.slice(prefix.length) as UploadedRxExceptionReason)
    : null;
}

function reasonFromEvent(event: AuditEvent | undefined): UploadedRxExceptionReason | null {
  if (!event) return null;
  const reason = event.after?.reason ?? event.message;
  return typeof reason === "string" && reason ? (reason as UploadedRxExceptionReason) : null;
}

function failureClass(reason: UploadedRxExceptionReason | null): string {
  if (!reason) return "other";
  if (["ocr_evidence_missing", "ocr_missing_required_fields", "ocr_not_contact_lens_prescription"].includes(reason)) {
    return "extraction failure";
  }
  if (reason === "ocr_ambiguous") return "normalization failure";
  if (reason === "product_unresolved" || reason === "product_mismatch") {
    return "product/coreId matching failure";
  }
  if (reason === "parameter_mismatch" || reason === "expiration_mismatch") {
    return "parameter mismatch";
  }
  if (reason === "ocr_low_confidence") return "confidence/gating failure";
  if (reason === "automation_state_update_failed") return "persistence/state/UI failure";
  return "other";
}

function increment(target: Record<string, number>, key: string) {
  target[key] = (target[key] ?? 0) + 1;
}

async function main() {
  const { data: recent, error: orderError } = await db
    .from("orders")
    .select(
      "id,created_at,status,verification_status,verification_passed,rx_status,rx_source,rx,rx_ocr_raw,rx_ocr_meta,rx_upload_path,sku,patient_name,prescriber_name,prescriber_phone",
    )
    .not("rx_upload_path", "is", null)
    .order("created_at", { ascending: false })
    .limit(Math.max(sampleSize * 2, sampleSize));
  if (orderError) throw orderError;

  const candidates = (recent ?? []) as AuditOrder[];
  const ids = candidates.map((order) => order.id);
  const events: AuditEvent[] = [];
  for (let index = 0; index < ids.length; index += 40) {
    const { data, error } = await db
      .from("order_events")
      .select("order_id,event_type,message,after,created_at")
      .in("order_id", ids.slice(index, index + 40))
      .in("event_type", [
        "verification_ocr_evaluated",
        "verification_uploaded_auto",
        "verification_uploaded_exception",
        "admin_prescription_accepted",
      ])
      .order("created_at", { ascending: true });
    if (error) throw error;
    events.push(...((data ?? []) as AuditEvent[]));
  }

  const eventsByOrder = new Map<string, AuditEvent[]>();
  for (const event of events) {
    eventsByOrder.set(event.order_id, [
      ...(eventsByOrder.get(event.order_id) ?? []),
      event,
    ]);
  }

  const withEvidence = candidates.filter((order) => {
    const orderEvents = eventsByOrder.get(order.id) ?? [];
    return Boolean(order.rx_ocr_raw) || orderEvents.length > 0 || reasonFromOrder(order);
  }).slice(0, sampleSize);

  const outcomes: Record<string, number> = {};
  const causes: Record<string, number> = {};
  const fallback = { invoked: 0, resolved: 0, failed_or_no_match: 0, not_recorded: 0 };
  let confidenceCalibrationDefects = 0;
  const records = withEvidence.map((order) => {
    const orderEvents = eventsByOrder.get(order.id) ?? [];
    const firstException = orderEvents.find(
      (event) => event.event_type === "verification_uploaded_exception",
    );
    const autoEvent = orderEvents.find(
      (event) => event.event_type === "verification_uploaded_auto",
    );
    const manualEvent = orderEvents.find(
      (event) => event.event_type === "admin_prescription_accepted",
    );
    const firstReason = reasonFromEvent(firstException) ?? reasonFromOrder(order);
    const rawOcr = order.rx_ocr_raw as Record<string, unknown> | null | undefined;
    const productAssessment = rawOcr
      ? assessOcrProductRequirements(
          rawOcr as OcrPrescriptionInterpretation,
          selectedProduct(order),
        )
      : { issues: [], multifocalEyes: [], productCoreIds: {} };
    const modelConfidence =
      typeof rawOcr?.confidence === "number" ? rawOcr.confidence : null;
    const notes = typeof rawOcr?.notes === "string" ? rawOcr.notes : "";
    const addRequirementMissing = productAssessment.issues.some(
      (issue) => issue.field === "add",
    );
    const semanticAddMisclassification =
      addRequirementMissing &&
      /\badd\b/i.test(notes) &&
      /\b(?:tint|not multifocal|no multifocal)\b/i.test(notes);
    const confidenceContradiction =
      productAssessment.issues.length > 0 &&
      modelConfidence !== null &&
      modelConfidence >= 0.95;
    if (confidenceContradiction) confidenceCalibrationDefects += 1;
    const diagnosedFirstClass = semanticAddMisclassification
      ? "normalization failure"
      : confidenceContradiction
        ? "confidence/gating failure"
        : null;
    const evaluationTime = new Date(order.created_at);
    const reevaluated = evaluateUploadedRxAutomation(
      { ...order, rx_status: "uploaded_customer_confirmed" },
      "requires_capture",
      Number.isNaN(evaluationTime.getTime()) ? new Date() : evaluationTime,
    );

    let outcome: string;
    if (autoEvent && reevaluated.autoVerify) {
      outcome = "auto-verified correctly";
    } else if (diagnosedFirstClass) {
      outcome = diagnosedFirstClass;
    } else if ((firstException || manualEvent) && reevaluated.autoVerify) {
      outcome = "unnecessarily sent to review";
    } else if (firstException || manualEvent) {
      outcome = "correctly sent to review";
    } else if (!order.rx_ocr_raw) {
      outcome = "extraction failure";
    } else if (order.verification_status === "auto_verified" && reevaluated.autoVerify) {
      outcome = "auto-verified correctly";
    } else {
      outcome = failureClass(
        reevaluated.autoVerify ? firstReason : reevaluated.reason,
      );
    }
    increment(outcomes, outcome);

    const causeReason = firstReason ?? (reevaluated.autoVerify ? null : reevaluated.reason);
    if (outcome !== "auto-verified correctly") {
      increment(causes, diagnosedFirstClass ?? failureClass(causeReason));
    }

    const evidence = firstException?.after?.evidence as
      | { productFallback?: Record<string, string> }
      | undefined;
    const fallbackStatuses = Object.values(evidence?.productFallback ?? {});
    if (fallbackStatuses.length) {
      fallback.invoked += 1;
      if (fallbackStatuses.includes("resolved")) fallback.resolved += 1;
      if (fallbackStatuses.some((status) => status !== "resolved")) {
        fallback.failed_or_no_match += 1;
      }
    } else if (causeReason === "product_unresolved") {
      fallback.not_recorded += 1;
    }

    return {
      order: anonymizedOrderKey(order.id),
      created_date: order.created_at.slice(0, 10),
      outcome,
      first_reason: causeReason,
      first_stage: diagnosedFirstClass
        ? "ocr_extraction"
        : causeReason
          ? uploadedRxFailureStage(causeReason)
          : null,
      product_requirement_issues: productAssessment.issues.map((issue) => ({
        eye: issue.eye,
        field: issue.field,
      })),
      confidence_calibration_defect: confidenceContradiction,
      current_recheck: reevaluated.autoVerify ? "passes" : reevaluated.reason,
    };
  });

  const unnecessary = outcomes["unnecessarily sent to review"] ?? 0;
  const autoVerified = outcomes["auto-verified correctly"] ?? 0;
  console.log(JSON.stringify({
    generated_at: new Date().toISOString(),
    sample_size: withEvidence.length,
    auto_verification: {
      count: autoVerified,
      percent: withEvidence.length ? Number((autoVerified * 100 / withEvidence.length).toFixed(1)) : 0,
    },
    unnecessary_manual_review: {
      count: unnecessary,
      percent: withEvidence.length ? Number((unnecessary * 100 / withEvidence.length).toFixed(1)) : 0,
    },
    outcomes,
    first_failure_causes: causes,
    smarter_ai_fallback: fallback,
    confidence_calibration_defects: confidenceCalibrationDefects,
    records: includeRecords ? records : undefined,
  }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Rx audit failed");
  process.exitCode = 1;
});
