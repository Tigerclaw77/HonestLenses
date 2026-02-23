export const runtime = "nodejs";

import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "../../../../../lib/supabase-server";
import { getUserFromRequest } from "../../../../../lib/get-user-from-request";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

/* =========================
   GET → Return stored OCR
========================= */

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: orderId } = await context.params;

  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: order, error } = await supabaseServer
    .from("orders")
    .select("rx_ocr_raw")
    .eq("id", orderId)
    .eq("user_id", user.id)
    .single();

  if (error || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (!order.rx_ocr_raw) {
    return NextResponse.json({ error: "OCR not found" }, { status: 404 });
  }

  return NextResponse.json({
    ocr_json: order.rx_ocr_raw,
  });
}

/* =========================
   POST → Run OCR + Store
========================= */

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: orderId } = await context.params;

  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: order, error } = await supabaseServer
    .from("orders")
    .select("id, rx_upload_path")
    .eq("id", orderId)
    .eq("user_id", user.id)
    .single();

  if (error || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (!order.rx_upload_path) {
    return NextResponse.json(
      { error: "No uploaded prescription found" },
      { status: 400 },
    );
  }

  /* =========================
     Download image from Supabase
  ========================= */

  const { data: fileData, error: downloadError } = await supabaseServer.storage
    .from("prescriptions")
    .download(order.rx_upload_path);

  if (downloadError || !fileData) {
    return NextResponse.json(
      { error: "Failed to download prescription image" },
      { status: 500 },
    );
  }

  const arrayBuffer = await fileData.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");

  /* =========================
     Strict Extraction Prompt
  ========================= */

  const systemPrompt = `
You are extracting structured data from a contact lens prescription image.

STRICT RULES:
- Extract ONLY values explicitly written.
- Do NOT infer or fabricate.
- If unclear, return null.
- Return strictly valid JSON.

Structure:

{
  "patient_name": string | null,
  "doctor_name": string | null,
  "prescriber_phone": string | null,
  "issued_date": string | null,
  "expires": string | null,
  "brand_raw": string | null,
  "right": {
    "sphere": number | null,
    "cylinder": number | null,
    "axis": number | null,
    "add": string | null,
    "base_curve": number | null,
    "diameter": number | null
  },
  "left": {
    "sphere": number | null,
    "cylinder": number | null,
    "axis": number | null,
    "add": string | null,
    "base_curve": number | null,
    "diameter": number | null
  }
}
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extract prescription data from this image.",
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/png;base64,${base64}`,
            },
          },
        ],
      },
    ],
    temperature: 0,
  });

  const text = response.choices[0].message.content ?? "";

  let parsed;

  try {
    parsed = JSON.parse(text);
  } catch {
    return NextResponse.json(
      { error: "OCR returned invalid JSON" },
      { status: 500 },
    );
  }

  const { error: updateError } = await supabaseServer
    .from("orders")
    .update({
      rx_ocr_raw: parsed,
      rx_status: "ocr_complete",
    })
    .eq("id", orderId)
    .eq("user_id", user.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}