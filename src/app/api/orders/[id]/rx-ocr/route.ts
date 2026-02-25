export const runtime = "nodejs";

import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "../../../../../lib/supabase-server";
import { getUserFromRequest } from "../../../../../lib/get-user-from-request";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

/* =========================
   BRAND TOKEN RULE SYSTEM
========================= */

type Manufacturer = "alcon" | "jnj" | "bausch" | "coopervision";
type BrandTokenStrength = "lock" | "boost";

type BrandTokenRule = {
  token: string;
  manufacturer: Manufacturer;
  strength: BrandTokenStrength;
};

const BRAND_TOKEN_RULES: BrandTokenRule[] = [
  // HARD LOCK TOKENS (conclusive)
  { token: "acuvue", manufacturer: "jnj", strength: "lock" },
  { token: "oasys", manufacturer: "jnj", strength: "lock" },
  { token: "total1", manufacturer: "alcon", strength: "lock" },
  { token: "total 1", manufacturer: "alcon", strength: "lock" },
  { token: "air optix", manufacturer: "alcon", strength: "lock" },
  { token: "purevision", manufacturer: "bausch", strength: "lock" },
  { token: "biofinity", manufacturer: "coopervision", strength: "lock" },

  // SOFT BOOST TOKENS (non-conclusive)
  { token: "dailies", manufacturer: "alcon", strength: "boost" },
];

function normalizeBrandText(s: string) {
  return s
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectBrandConstraints(brandRaw: string | null) {
  const result = {
    lockedManufacturer: null as Manufacturer | null,
    boostManufacturers: [] as Manufacturer[],
    matchedTokens: [] as string[],
  };

  if (!brandRaw) return result;

  const normalized = normalizeBrandText(brandRaw);

  const matches = BRAND_TOKEN_RULES.filter(rule =>
    normalized.includes(rule.token)
  );

  const lockMatch = matches.find(m => m.strength === "lock");

  if (lockMatch) {
    result.lockedManufacturer = lockMatch.manufacturer;
    result.matchedTokens = matches.map(m => m.token);
    return result;
  }

  for (const m of matches) {
    if (m.strength === "boost") {
      if (!result.boostManufacturers.includes(m.manufacturer)) {
        result.boostManufacturers.push(m.manufacturer);
      }
    }
  }

  result.matchedTokens = matches.map(m => m.token);
  return result;
}

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
    .select("rx_ocr_raw, rx_ocr_meta")
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
    ocr_meta: order.rx_ocr_meta ?? null,
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

  const { data: fileData, error: downloadError } =
    await supabaseServer.storage
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
     STRICT MEDICAL EXTRACTION
  ========================= */

  const systemPrompt = `
You are extracting structured data from a CONTACT LENS prescription image.

This is a medical-legal document.

STRICT RULES:
- Extract ONLY values explicitly written.
- Do NOT infer manufacturer from parameters.
- Do NOT normalize brand names.
- Copy brand exactly as written.
- If unclear, return null.
- Return strictly valid JSON with no commentary.

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
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: "Extract prescription data from this image." },
          {
            type: "image_url",
            image_url: { url: `data:image/png;base64,${base64}` },
          },
        ],
      },
    ],
    temperature: 0,
  });

  const rawText = response.choices[0].message.content ?? "";

  const cleaned = rawText
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return NextResponse.json(
      { error: "OCR returned invalid JSON" },
      { status: 500 },
    );
  }

  /* =========================
     BRAND CONSTRAINT ANALYSIS
  ========================= */

  const brandConstraints = detectBrandConstraints(parsed.brand_raw);

  const { error: updateError } = await supabaseServer
    .from("orders")
    .update({
      rx_ocr_raw: parsed,
      rx_ocr_meta: {
        brand_constraints: brandConstraints,
      },
      rx_status: "ocr_complete",
    })
    .eq("id", orderId)
    .eq("user_id", user.id);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}