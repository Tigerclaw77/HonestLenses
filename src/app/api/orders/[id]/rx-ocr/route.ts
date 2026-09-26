export const runtime = "nodejs";

import { NextResponse, NextRequest } from "next/server";
import OpenAI from "openai";
import { randomUUID } from "node:crypto";
import { supabaseServer } from "@/lib/supabase-server";
import { POSTHOG_EVENTS } from "@/lib/posthog/events";
import { captureServerEvent, captureServerException } from "@/lib/posthog/server";
import {
  canAccessOrder,
  getOrderAccess,
  hasOrderAccessContext,
} from "@/lib/order-access";
import { validatePrescriptionUpload } from "@/lib/security/uploadValidation";
import { originalProduct, record, selectedProduct } from "@/lib/orders/productSelection";
import { lenses } from "@/LensCore";
import { getLensSkus } from "@/lib/pricing/getLensSkus";
import {
  enforceRateLimit,
  rateLimitErrorResponse,
} from "@/lib/security/rateLimit";
import {
  applyCategoricalAddRecovery,
  categoricalAddRecoveryEyes,
  mapOcrInterpretationToPrescription,
  type CategoricalAddRecovery,
  type OcrPrescriptionInterpretation,
  type PersistedOcrPrescription,
} from "@/lib/orders/ocrPrescription";
import {
  assessOcrProductRequirements,
  calibrateOcrConfidence,
  type OcrProductIssue,
} from "@/lib/orders/ocrProductRequirements";

/* =========================
   TYPES
========================= */

type Rx = PersistedOcrPrescription;
type Interpretation = OcrPrescriptionInterpretation;

/* =========================
   HELPERS
========================= */

function hasUsableRx(rx: Rx): boolean {
  return (
    (rx.right?.sphere !== null || rx.left?.sphere !== null) &&
    rx.expires !== null
  );
}

function extractedFieldPresence(interpretation: Interpretation) {
  const eye = (value: Interpretation["right"]) => ({
    sphere: value?.sphere != null,
    cylinder: value?.cylinder != null,
    axis: value?.axis != null,
    add: Boolean(value?.add?.trim()),
    base_curve: value?.baseCurve != null,
    diameter: value?.diameter != null,
    product: Boolean(
      value?.brand_raw?.trim() || interpretation.brand_raw?.trim(),
    ),
  });
  return {
    right: eye(interpretation.right),
    left: eye(interpretation.left),
    expiration: Boolean(interpretation.expirationDate),
  };
}

/* =========================
   INTERPRETATION ENGINE
========================= */

async function runPrescriptionInterpretation(
  base64: string,
  mimeType: string,
  productContext: unknown,
): Promise<Interpretation> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("Prescription OCR is not configured");
  const openai = new OpenAI({ apiKey });
  const prompt = `
You are interpreting a contact lens prescription.

Your job is to READ and INTERPRET the prescription like an optometrist.

Even if labels are missing, infer meaning based on standard formats.

Examples:
- "-100-125x10 8.6 14.5" → sphere, cylinder, axis, base curve, diameter

Rules:
- Do NOT guess values not present
- Axis must be 1–180
- BC and DIA are decimal values
- Return expirationDate in YYYY-MM-DD format only
- Return multifocal add exactly as printed (for example LO, LOW, MED, MID, HI, HIGH)
- Prefer correct interpretation over returning null
- If ambiguous, choose most standard interpretation and note in "notes"

Catalog context for the product selected before upload:
${JSON.stringify(productContext)}

Use this catalog context to understand which fields must be read from the image.
It is not prescription evidence: never copy or invent a value merely because a
product requires it. In particular, a multifocal product requires an ADD value,
and printed MED is the same catalog option as MID while the extracted value must
remain exactly as printed.

IMPORTANT:

Many prescriptions contain multiple sections (e.g., glasses and contact lenses).

- The glasses section may be empty.
- You MUST scan the ENTIRE document.
- You MUST prioritize the CONTACT LENS section.
- The contact lens section often includes:
  - Brand / Model
  - BC (base curve)
  - DIA (diameter)

If one section is empty but another contains valid data, use the section with valid data.

Do NOT stop at the first table.

If both glasses and contact lens data exist, ONLY return contact lens values.

If different brands are listed per eye, assign them correctly.

Return STRICT JSON:
{
  "right": {
    "sphere": number | null,
    "cylinder": number | null,
    "axis": number | null,
    "add": string | null,
    "baseCurve": number | null,
    "diameter": number | null,
    "brand_raw": string | null
  },
  "left": {
    "sphere": number | null,
    "cylinder": number | null,
    "axis": number | null,
    "add": string | null,
    "baseCurve": number | null,
    "diameter": number | null,
    "brand_raw": string | null
  },
  "expirationDate": string | null,
  "patient_name": string | null,
  "doctor_name": string | null,
  "prescriber_phone": string | null,
  "brand_raw": string | null,
  "confidence": number,
  "looks_like_contact_lens_rx": boolean,
  "notes": string | null
}
`;

  const imageUrl = `data:${mimeType};base64,${base64}`;

  const response = await openai.responses.create({
    model: "gpt-4.1",
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: imageUrl },
        ] as unknown as string,
      },
    ],
    temperature: 0,
  });

  const rawText =
    typeof response.output_text === "string" ? response.output_text.trim() : "";

  if (!rawText) {
    throw new Error("Interpretation returned empty output");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error("Invalid JSON from interpretation");
  }

  return parsed as Interpretation;
}

async function recoverCategoricalAdds(
  base64: string,
  mimeType: string,
  interpretation: Interpretation,
  missingEyes: readonly ("right" | "left")[],
): Promise<CategoricalAddRecovery> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("Prescription OCR is not configured");
  const openai = new OpenAI({ apiKey });
  const productEvidence = Object.fromEntries(
    missingEyes.map((eyeName) => [
      eyeName,
      interpretation[eyeName]?.brand_raw ?? interpretation.brand_raw ?? null,
    ]),
  );
  const response = await openai.responses.create({
    model: "gpt-4.1",
    store: false,
    temperature: 0,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Re-read the contact-lens prescription image only for categorical multifocal ADD labels that the first pass left blank. The affected eye/product evidence is ${JSON.stringify(productEvidence)}. Return the value exactly as printed (LO, LOW, MED, MID, HI, or HIGH). Return NONE when it is not clearly visible. Do not infer from the product, patient selection, or typical parameters.`,
          },
          { type: "input_image", image_url: `data:${mimeType};base64,${base64}` },
        ] as unknown as string,
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "categorical_add_recovery",
        strict: true,
        schema: {
          type: "object",
          properties: {
            right_add: {
              type: "string",
              enum: ["LO", "LOW", "MED", "MID", "HI", "HIGH", "NONE"],
            },
            left_add: {
              type: "string",
              enum: ["LO", "LOW", "MED", "MID", "HI", "HIGH", "NONE"],
            },
          },
          required: ["right_add", "left_add"],
          additionalProperties: false,
        },
      },
    },
  });
  const parsed = JSON.parse(response.output_text || "{}") as {
    right_add?: string;
    left_add?: string;
  };
  return {
    right_add: parsed.right_add === "NONE" ? null : parsed.right_add,
    left_add: parsed.left_add === "NONE" ? null : parsed.left_add,
  };
}

/* =========================
   ROUTE HANDLER
========================= */

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  let orderIdForTelemetry: string | null = null;

  try {
    const { id: orderId } = await context.params;
    orderIdForTelemetry = orderId;

    const access = await getOrderAccess(req);
    if (!hasOrderAccessContext(access)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: order, error: orderError } = await supabaseServer
      .from("orders")
      .select("id, user_id, status, payment_intent_id, rx, sku, rx_ocr_meta, updated_at")
      .eq("id", orderId)
      .maybeSingle();

    if (orderError || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (!canAccessOrder(access, order)) {
      return NextResponse.json({ error: "Order not authorized" }, { status: 403 });
    }

    if (!["draft", "pending"].includes(order.status)) {
      return NextResponse.json({ error: "Order is not editable" }, { status: 400 });
    }

    const rateLimit = await enforceRateLimit(req, {
      scope: "prescription-upload",
      identity: orderId,
      limit: 5,
      windowSeconds: 60 * 60,
    });
    if (!rateLimit.allowed) return rateLimitErrorResponse(rateLimit);

    const formData = await req.formData();
    const selectedFromUpload = selectedProduct({ rx: {
      right: { coreId: formData.get("selected_right") },
      left: { coreId: formData.get("selected_left") },
    } });
    const original = originalProduct(order);
    const skuCoreId =
      typeof order.sku === "string"
        ? lenses.find((lens) => getLensSkus(lens).includes(order.sku))?.coreId ?? null
        : null;
    const selection = {
      ...original,
      right: original.right ?? selectedFromUpload.right ?? skuCoreId,
      left: original.left ?? selectedFromUpload.left ?? skuCoreId,
    };
    const productContext = Object.fromEntries(
      (["right", "left"] as const).flatMap((eyeName) => {
        const coreId = selection[eyeName];
        const lens = coreId
          ? lenses.find((candidate) => candidate.coreId === coreId)
          : null;
        return lens
          ? [[eyeName, {
              coreId: lens.coreId,
              displayName: lens.displayName,
              toric: lens.type.toric,
              multifocal: lens.type.multifocal,
              requiredFields: [
                "sphere",
                ...(lens.type.toric ? ["cylinder", "axis"] : []),
                ...(lens.type.multifocal ? ["add"] : []),
                "baseCurve",
                "diameter",
              ],
              addOptions: lens.parameters.multifocal?.adds ?? [],
            }]]
          : [];
      }),
    );
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file uploaded", code: "invalid_upload" },
        { status: 400 },
      );
    }

    let validated: Awaited<ReturnType<typeof validatePrescriptionUpload>>;
    try {
      validated = await validatePrescriptionUpload(file);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Invalid prescription image.",
          code: "invalid_upload",
        },
        { status: 400 },
      );
    }

    const storagePath =
      `rx/${orderId}/${randomUUID()}.${validated.extension}`;

    const { error: uploadError } = await supabaseServer.storage
      .from("prescriptions")
      .upload(storagePath, validated.buffer, {
        contentType: validated.mimeType,
        upsert: false,
      });

    if (uploadError) {
      console.error("RX UPLOAD ERROR:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload Rx file", code: "storage_upload_failed" },
        { status: 500 },
      );
    }

    const { data: evidenceRows, error: evidenceError } = await supabaseServer
      .from("orders")
      .update({
        rx_upload_path: storagePath,
        rx_status: "uploaded_pending_review",
        verification_status: "pending",
        verification_passed: false,
        rx_ocr_meta: { ...record(order.rx_ocr_meta), selected_product: selection, product_resolution: null },
      })
      .eq("id", orderId)
      .eq("status", order.status)
      .eq("updated_at", order.updated_at).select("id");

    if (evidenceError || !evidenceRows?.length) {
      await supabaseServer.storage.from("prescriptions").remove([storagePath]);
      return NextResponse.json(
        { error: "Failed to save Rx evidence", code: "evidence_save_failed" },
        { status: 500 },
      );
    }

    if (
      process.env.PRESCRIPTION_OCR_ENABLED === "false" ||
      !process.env.OPENAI_API_KEY?.trim()
    ) {
      return NextResponse.json({
        ok: true,
        usable: false,
        reviewRequired: true,
        code: "ocr_unavailable",
      });
    }

    let interpretation: Interpretation;
    let addRecoveryAttempted = false;
    let addRecoveryEyes: Array<"right" | "left"> = [];
    let modelConfidence: number | null = null;
    let productRequirementIssues: OcrProductIssue[] = [];
    try {
      interpretation = await runPrescriptionInterpretation(
        validated.buffer.toString("base64"),
        validated.mimeType,
        productContext,
      );
      modelConfidence =
        typeof interpretation.confidence === "number" &&
        Number.isFinite(interpretation.confidence)
          ? interpretation.confidence
          : null;

      let productAssessment = assessOcrProductRequirements(interpretation, selection);
      const missingCategoricalAdds = categoricalAddRecoveryEyes(
        interpretation,
        productAssessment.multifocalEyes,
      );
      if (missingCategoricalAdds.length) {
        addRecoveryAttempted = true;
        try {
          const recovered = await recoverCategoricalAdds(
            validated.buffer.toString("base64"),
            validated.mimeType,
            interpretation,
            missingCategoricalAdds,
          );
          interpretation = applyCategoricalAddRecovery(
            interpretation,
            recovered,
            productAssessment.multifocalEyes,
          );
          addRecoveryEyes = missingCategoricalAdds.filter(
            (eyeName) => Boolean(interpretation[eyeName]?.add),
          );
        } catch (recoveryError) {
          console.error("Categorical ADD recovery failed", {
            orderId,
            error:
              recoveryError instanceof Error
                ? recoveryError.message
                : "Unknown recovery failure",
          });
        }
      }
      productAssessment = assessOcrProductRequirements(interpretation, selection);
      productRequirementIssues = productAssessment.issues;
      const effectiveConfidence = calibrateOcrConfidence(
        modelConfidence,
        productRequirementIssues,
        addRecoveryAttempted,
      );
      interpretation = {
        ...interpretation,
        confidence: effectiveConfidence,
      };
    } catch (interpretationError) {
      await supabaseServer
        .from("orders")
        .update({
          rx_status: "automation_review_ocr_evidence_missing",
          verification_status: "pending",
        })
        .eq("id", orderId).eq("rx_upload_path", storagePath).eq("status", order.status);
      await supabaseServer.from("order_events").insert({
        order_id: orderId,
        event_type: "verification_uploaded_exception",
        actor: "system",
        message: "ocr_evidence_missing",
        after: { reason: "ocr_evidence_missing", stage: "ocr_interpretation" },
      });
      await captureServerException({
        event: POSTHOG_EVENTS.OCR_FAILED,
        error: interpretationError,
        request: req,
        properties: {
          order_id: orderId,
          reason: "ocr_interpretation_failed",
        },
      });
      return NextResponse.json({
        ok: true,
        usable: false,
        reviewRequired: true,
        code: "ocr_server_failed",
      });
    }

    const rx = mapOcrInterpretationToPrescription(interpretation);
    const usable = hasUsableRx(rx);

    const isLikelyRx =
      usable &&
      productRequirementIssues.length === 0 &&
      interpretation.looks_like_contact_lens_rx === true &&
      (interpretation.confidence ?? 0) > 0.85;

    if (!usable || !isLikelyRx) {
      await captureServerEvent({
        event: POSTHOG_EVENTS.OCR_FAILED,
        request: req,
        properties: {
          order_id: orderId,
          usable,
          is_likely_rx: isLikelyRx,
          confidence: interpretation.confidence ?? null,
          reason: !usable || productRequirementIssues.length
            ? "missing_required_rx_fields"
            : "low_confidence_or_not_contact_lens_rx",
        },
      });
    }

    const { data: ocrRows, error: updateError } = await supabaseServer
      .from("orders")
      .update({
        // OCR is evidence, not permission to replace a customer's selection.
        rx: Object.keys(record(order.rx)).length ? order.rx : rx,
        rx_status: !usable
          ? "automation_review_ocr_missing_required_fields"
          : productRequirementIssues.length
            ? "automation_review_ocr_missing_required_fields"
          : !isLikelyRx
            ? interpretation.looks_like_contact_lens_rx === true
              ? "automation_review_ocr_low_confidence"
              : "automation_review_ocr_not_contact_lens_prescription"
            : "ocr_customer_confirmation_required",
        verification_status: "pending",
        rx_ocr_raw: interpretation,
        rx_ocr_meta: {
          ...record(order.rx_ocr_meta),
          selected_product: selection,
          ocr_reconciliation: {
            model_confidence: modelConfidence,
            effective_confidence: interpretation.confidence ?? null,
            product_requirement_issues: productRequirementIssues,
            categorical_add_attempted: addRecoveryAttempted,
            categorical_add_recovered_eyes: addRecoveryEyes,
          },
        },
      })
      .eq("id", orderId)
      .eq("rx_upload_path", storagePath)
      .eq("status", order.status).select("id");

    if (updateError || !ocrRows?.length) {
      console.error("RX UPDATE ERROR:", updateError);
      return NextResponse.json(
        { error: "Failed to save Rx", code: "rx_save_failed" },
        { status: 500 },
      );
    }

    const extractionReason = !usable
      ? "ocr_missing_required_fields"
      : productRequirementIssues.length
        ? "ocr_missing_required_fields"
      : !isLikelyRx
        ? interpretation.looks_like_contact_lens_rx === true
          ? "ocr_low_confidence"
          : "ocr_not_contact_lens_prescription"
        : "customer_confirmation_required";
    const { error: auditError } = await supabaseServer.from("order_events").insert({
      order_id: orderId,
      event_type: "verification_ocr_evaluated",
      actor: "system",
      message: extractionReason,
      after: {
        stage: "ocr_extraction",
        reason: extractionReason,
        usable,
        confidence: interpretation.confidence ?? null,
        looks_like_contact_lens_rx:
          interpretation.looks_like_contact_lens_rx === true,
        fields: extractedFieldPresence(interpretation),
        model_confidence: modelConfidence,
        effective_confidence: interpretation.confidence ?? null,
        product_requirement_issues: productRequirementIssues,
        recovery: {
          categorical_add_attempted: addRecoveryAttempted,
          categorical_add_recovered_eyes: addRecoveryEyes,
        },
      },
    });
    if (auditError) {
      console.error("OCR evaluation audit event failed", {
        orderId,
        error: auditError.message,
      });
    }

    return NextResponse.json({
      ok: true,
      usable,
      confidence: interpretation.confidence ?? 0,
      reviewRequired: !isLikelyRx,
    });
  } catch (err) {
    console.error("RX OCR ROUTE ERROR:", err);
    await captureServerException({
      event: POSTHOG_EVENTS.OCR_FAILED,
      error: err,
      request: req,
      properties: {
        order_id: orderIdForTelemetry,
        reason: "rx_ocr_route_exception",
      },
    });
    return NextResponse.json(
      { error: "Server error", code: "ocr_server_failed" },
      { status: 500 },
    );
  }
}
