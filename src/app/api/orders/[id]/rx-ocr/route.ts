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
import {
  enforceRateLimit,
  rateLimitErrorResponse,
} from "@/lib/security/rateLimit";
import {
  mapPrescriptionInterpretationToRx,
  type PrescriptionOcrInterpretation,
  type ParsedPrescriptionRx,
} from "@/lib/orders/prescriptionOcrParsing";
import {
  buildPowerSignVerification,
  type PowerSignImageRecheck,
} from "@/lib/orders/powerSignVerification";

/* =========================
   TYPES
========================= */

type Interpretation = PrescriptionOcrInterpretation;

function hasUsableRx(rx: ParsedPrescriptionRx): boolean {
  return (
    (rx.right?.sphere !== null || rx.left?.sphere !== null) &&
    rx.expires !== null
  );
}

/* =========================
   INTERPRETATION ENGINE
========================= */

async function runPrescriptionInterpretation(
  base64: string,
  mimeType: string,
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
- Preserve the printed sign on every power exactly. A leading "-" is a negative power; never convert it to a positive value.
- "DS" means no cylinder (sphere only); it does not remove or change the sphere value.
- Axis must be 1–180
- BC and DIA are decimal values
- Return expirationDate in YYYY-MM-DD format only
- Return multifocal add exactly as printed (for example LOW, MID, HIGH)
- Prefer correct interpretation over returning null
- If ambiguous, choose most standard interpretation and note in "notes"

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
  "notes": string | null,
  "power_evidence": {
    "right": {
      "sphere": { "raw_text": string | null, "value": number | null },
      "cylinder": { "raw_text": string | null, "value": number | null }
    },
    "left": {
      "sphere": { "raw_text": string | null, "value": number | null },
      "cylinder": { "raw_text": string | null, "value": number | null }
    }
  }
}

For every OD/OS SPHERE/CYLINDER field, power_evidence.raw_text MUST quote the
nearby displayed text exactly, including the eye label and the original sign or
dash glyph. Do not normalize, replace, or omit a printed minus/plus glyph.
For a cylinder printed as DS/plano, set value to null and quote DS/plano in
raw_text. A sphere such as "-4.25 DS" remains -4.25; DS applies only to the
cylinder column.
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

async function runPowerSignImageRecheck(
  base64: string,
  mimeType: string,
): Promise<PowerSignImageRecheck> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("Prescription OCR is not configured");
  const openai = new OpenAI({ apiKey });
  const prompt = `
Independently re-read only the OD/OS SPHERE and CYLINDER table cells in this
contact-lens prescription image. Treat this as a separate image-region check;
inspect each local cell and do not rely on another extraction.

For each cell, quote nearby text exactly in raw_text, including OD/OS, SPH/CYL,
and the printed sign glyph. Distinguish minus signs from table lines/noise and
preserve hyphen-minus, Unicode minus, en/em dash, or plus exactly as seen.
"DS" or "plano" in CYL means value null. Do not infer a positive sign when a
minus glyph is unclear or missing; return raw_text null rather than guessing.

Return STRICT JSON only:
{
  "right": {
    "sphere": { "raw_text": string | null, "value": number | null },
    "cylinder": { "raw_text": string | null, "value": number | null }
  },
  "left": {
    "sphere": { "raw_text": string | null, "value": number | null },
    "cylinder": { "raw_text": string | null, "value": number | null }
  }
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
  if (!rawText) throw new Error("Power-sign image recheck returned empty output");
  try {
    return JSON.parse(rawText) as PowerSignImageRecheck;
  } catch {
    throw new Error("Invalid JSON from power-sign image recheck");
  }
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
      .select("id, user_id, status, payment_intent_id")
      .eq("id", orderId)
      .maybeSingle();

    if (orderError || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (!canAccessOrder(access, order)) {
      return NextResponse.json({ error: "Order not authorized" }, { status: 403 });
    }

    if (!["draft", "pending", "authorized"].includes(order.status)) {
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

    const { error: evidenceError } = await supabaseServer
      .from("orders")
      .update({
        rx_upload_path: storagePath,
        rx_status: "uploaded_pending_review",
        verification_status: "pending",
      })
      .eq("id", orderId)
      .in("status", ["draft", "pending", "authorized"]);

    if (evidenceError) {
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
    try {
      interpretation = await runPrescriptionInterpretation(
        validated.buffer.toString("base64"),
        validated.mimeType,
      );
    } catch (interpretationError) {
      await supabaseServer
        .from("orders")
        .update({
          rx_status: "automation_review_ocr_evidence_missing",
          verification_status: "pending",
        })
        .eq("id", orderId);
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

    let imageRecheck: PowerSignImageRecheck | null = null;
    try {
      imageRecheck = await runPowerSignImageRecheck(
        validated.buffer.toString("base64"),
        validated.mimeType,
      );
    } catch (imageRecheckError) {
      await captureServerException({
        event: POSTHOG_EVENTS.OCR_FAILED,
        error: imageRecheckError,
        request: req,
        properties: {
          order_id: orderId,
          reason: "power_sign_image_recheck_failed",
        },
      });
    }
    interpretation.power_sign_verification = buildPowerSignVerification(
      interpretation,
      imageRecheck,
    );

    const rx = mapPrescriptionInterpretationToRx(interpretation);
    const usable = hasUsableRx(rx);
    const powerSignNeedsManualReview =
      interpretation.power_sign_verification.has_manual_review;

    const isLikelyRx =
      usable &&
      interpretation.looks_like_contact_lens_rx === true &&
      (interpretation.confidence ?? 0) > 0.85;

    if (!usable || !isLikelyRx || powerSignNeedsManualReview) {
      await captureServerEvent({
        event: POSTHOG_EVENTS.OCR_FAILED,
        request: req,
        properties: {
          order_id: orderId,
          usable,
          is_likely_rx: isLikelyRx,
          confidence: interpretation.confidence ?? null,
          reason: !usable
            ? "missing_required_rx_fields"
            : powerSignNeedsManualReview
              ? "power_sign_needs_manual_review"
              : "low_confidence_or_not_contact_lens_rx",
        },
      });
    }

    const { error: updateError } = await supabaseServer
      .from("orders")
      .update({
        rx,
        rx_status: !usable
          ? "automation_review_ocr_missing_required_fields"
          : powerSignNeedsManualReview
            ? "automation_review_ocr_power_sign_conflict"
          : !isLikelyRx
            ? interpretation.looks_like_contact_lens_rx === true
              ? "automation_review_ocr_low_confidence"
              : "automation_review_ocr_not_contact_lens_prescription"
            : "ocr_customer_confirmation_required",
        verification_status: "pending",
        rx_ocr_raw: interpretation,
      })
      .eq("id", orderId);

    if (updateError) {
      console.error("RX UPDATE ERROR:", updateError);
      return NextResponse.json(
        { error: "Failed to save Rx", code: "rx_save_failed" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      usable,
      confidence: interpretation.confidence ?? 0,
      reviewRequired: !usable || powerSignNeedsManualReview,
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
