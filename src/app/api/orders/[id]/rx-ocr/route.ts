export const runtime = "nodejs";

import { NextResponse, NextRequest } from "next/server";
import OpenAI from "openai";
import { supabaseServer } from "@/lib/supabase-server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

/* =========================
   TYPES
========================= */

type Eye = {
  sphere: number | null;
  cylinder: number | null;
  axis: number | null;
  base_curve: number | null;
  diameter: number | null;
};

type Rx = {
  right: Eye | null;
  left: Eye | null;
  expires: string | null;
};

type Interpretation = {
  right?: {
    sphere?: number | null;
    cylinder?: number | null;
    axis?: number | null;
    baseCurve?: number | null;
    diameter?: number | null;
  } | null;
  left?: {
    sphere?: number | null;
    cylinder?: number | null;
    axis?: number | null;
    baseCurve?: number | null;
    diameter?: number | null;
  } | null;
  expirationDate?: string | null;
  patient_name?: string | null;
  doctor_name?: string | null;
  prescriber_phone?: string | null;
  brand_raw?: string | null;
  confidence?: number;
  looks_like_contact_lens_rx?: boolean;
  notes?: string | null;
};

/* =========================
   HELPERS
========================= */

function mapInterpretationToRx(interp: Interpretation): Rx {
  return {
    right: interp.right
      ? {
          sphere: interp.right.sphere ?? null,
          cylinder: interp.right.cylinder ?? null,
          axis: interp.right.axis ?? null,
          base_curve: interp.right.baseCurve ?? null,
          diameter: interp.right.diameter ?? null,
        }
      : null,

    left: interp.left
      ? {
          sphere: interp.left.sphere ?? null,
          cylinder: interp.left.cylinder ?? null,
          axis: interp.left.axis ?? null,
          base_curve: interp.left.baseCurve ?? null,
          diameter: interp.left.diameter ?? null,
        }
      : null,

    expires: interp.expirationDate ?? null,
  };
}

function hasUsableRx(rx: Rx): boolean {
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
  const dataUrl = `data:${mimeType};base64,${base64}`;

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

Return STRICT JSON:
{
  "right": {...},
  "left": {...},
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

  const content = [
    { type: "input_text", text: prompt },
    { type: "input_image", image_url: dataUrl, detail: "auto" },
  ];

  const response = await openai.responses.create({
    model: "gpt-4.1",
    input: [
      {
        role: "user",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        content: content as any,
      },
    ],
    temperature: 0,
  });

  const rawText = response.output_text?.trim();

  if (!rawText) {
    throw new Error("Interpretation returned empty output");
  }

  console.log("INTERPRET RAW:", rawText);

  let parsed: unknown;

  try {
    parsed = JSON.parse(rawText);
  } catch {
    console.error("INTERPRET PARSE FAIL:", rawText);
    throw new Error("Invalid JSON from interpretation");
  }

  return parsed as Interpretation;
}

/* =========================
   ROUTE HANDLER
========================= */

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: orderId } = await context.params;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return new Response("No file uploaded", { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = file.type;

    const interpretation = await runPrescriptionInterpretation(
      base64,
      mimeType,
    );

    const rx = mapInterpretationToRx(interpretation);
    const usable = hasUsableRx(rx);

    const isLikelyRx =
      usable &&
      interpretation.looks_like_contact_lens_rx === true &&
      (interpretation.confidence ?? 0) > 0.85;

    console.log({
      orderId,
      usable,
      isLikelyRx,
      confidence: interpretation.confidence,
      rx,
    });

    const { error: updateError } = await supabaseServer
      .from("orders")
      .update({
        rx,
        rx_status: usable ? "ocr_complete" : "ocr_failed",
        verification_status: isLikelyRx ? "auto_verified" : "pending",
        rx_ocr_raw: interpretation,
      })
      .eq("id", orderId);

    if (updateError) {
      console.error("RX UPDATE ERROR:", updateError);
      return new Response("Failed to save Rx", { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      usable,
      confidence: interpretation.confidence ?? 0,
    });
  } catch (err) {
    console.error("RX OCR ROUTE ERROR:", err);
    return new Response("Server error", { status: 500 });
  }
}
