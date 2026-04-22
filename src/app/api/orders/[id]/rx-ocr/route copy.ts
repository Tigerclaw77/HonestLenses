export const runtime = "nodejs";

import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "../../../../../lib/supabase-server";
import { getUserFromRequest } from "../../../../../lib/get-user-from-request";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

/* =========================
   DATE NORMALIZATION
========================= */

function normalizeDate(input: string | null): string | null {
  if (!input) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/;
  if (iso.test(input)) return input;

  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  const match = input.match(us);

  if (match) {
    const [, m, d, y] = match;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  console.warn("⚠️ Could not normalize date", input);
  return null;
}

/* =========================
   BRAND TOKEN RULE SYSTEM
========================= */

type Manufacturer = "alcon" | "vistakon" | "bausch" | "coopervision";
type BrandTokenStrength = "lock" | "boost";

type BrandTokenRule = {
  token: string;
  manufacturer: Manufacturer;
  strength: BrandTokenStrength;
};

const BRAND_TOKEN_RULES: BrandTokenRule[] = [
  { token: "acuvue", manufacturer: "vistakon", strength: "lock" },
  { token: "oasys", manufacturer: "vistakon", strength: "lock" },
  { token: "total1", manufacturer: "alcon", strength: "lock" },
  { token: "total 1", manufacturer: "alcon", strength: "lock" },
  { token: "air optix", manufacturer: "alcon", strength: "lock" },
  { token: "purevision", manufacturer: "bausch", strength: "lock" },
  { token: "biofinity", manufacturer: "coopervision", strength: "lock" },
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

  const matches = BRAND_TOKEN_RULES.filter((rule) =>
    normalized.includes(rule.token),
  );

  const lockMatch = matches.find((m) => m.strength === "lock");

  if (lockMatch) {
    result.lockedManufacturer = lockMatch.manufacturer;
    result.matchedTokens = matches.map((m) => m.token);
    return result;
  }

  for (const m of matches) {
    if (m.strength === "boost") {
      if (!result.boostManufacturers.includes(m.manufacturer)) {
        result.boostManufacturers.push(m.manufacturer);
      }
    }
  }

  result.matchedTokens = matches.map((m) => m.token);
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
    return NextResponse.json({
      status: "pending",
      ocr_json: null,
      ocr_meta: null,
    });
  }

  return NextResponse.json({
    status: "complete",
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

  console.log("OCR START", { orderId });

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

  const { data: fileData, error: downloadError } = await supabaseServer.storage
    .from("prescriptions")
    .download(order.rx_upload_path);

  if (downloadError || !fileData) {
    console.error("OCR DOWNLOAD FAILED", downloadError);
    return NextResponse.json(
      { error: "Failed to download prescription image" },
      { status: 500 },
    );
  }

  const arrayBuffer = await fileData.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");

  const systemPrompt = `...`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `${systemPrompt}

Return ONLY valid JSON. Do not include text, markdown, or explanation.`,
      },
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

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    console.error("OCR JSON PARSE FAILED", rawText);
    return NextResponse.json(
      { error: "OCR returned invalid JSON" },
      { status: 500 },
    );
  }

  // 🔥 CRITICAL FIX — NORMALIZE TO YESTERDAY’S SHAPE
  const normalized = {
    // ✅ support OLD format (yesterday)
    right: parsed?.right
      ? {
          sphere: parsed.right.sphere ?? null,
          cylinder: parsed.right.cylinder ?? null,
          axis: parsed.right.axis ?? null,
          base_curve: parsed.right.base_curve ?? null,
          diameter: parsed.right.diameter ?? null,
          add: parsed.right.add ?? null,
        }
      : // ✅ fallback to NEW format (today)
        parsed?.Prescription?.["O.D."]
        ? {
            sphere: Number(parsed.Prescription["O.D."]["Power/SPH"]),
            cylinder: Number(parsed.Prescription["O.D."]["CYL"]),
            axis: Number(parsed.Prescription["O.D."]["Axis"]),
            base_curve: Number(parsed.Prescription["O.D."]["BC"]),
            diameter: Number(parsed.Prescription["O.D."]["DIA"]),
            add: parsed.Prescription["O.D."]["ADD"] ?? null,
          }
        : null,

    left: parsed?.left
      ? {
          sphere: parsed.left.sphere ?? null,
          cylinder: parsed.left.cylinder ?? null,
          axis: parsed.left.axis ?? null,
          base_curve: parsed.left.base_curve ?? null,
          diameter: parsed.left.diameter ?? null,
          add: parsed.left.add ?? null,
        }
      : parsed?.Prescription?.["O.S."]
        ? {
            sphere: Number(parsed.Prescription["O.S."]["Power/SPH"]),
            cylinder: Number(parsed.Prescription["O.S."]["CYL"]),
            axis: Number(parsed.Prescription["O.S."]["Axis"]),
            base_curve: Number(parsed.Prescription["O.S."]["BC"]),
            diameter: Number(parsed.Prescription["O.S."]["DIA"]),
            add: parsed.Prescription["O.S."]["ADD"] ?? null,
          }
        : null,

    expires:
      parsed?.expires ?? normalizeDate(parsed?.Prescription?.Expires ?? null),

    issued_date:
      parsed?.issued_date ??
      normalizeDate(parsed?.Prescription?.Issued ?? null),

    patient_name: parsed?.patient_name ?? parsed?.Patient?.Name ?? null,

    doctor_name: parsed?.doctor_name ?? parsed?.Doctor?.Name ?? null,

    prescriber_phone: parsed?.prescriber_phone ?? parsed?.Doctor?.Phone ?? null,

    brand_raw: parsed?.brand_raw ?? parsed?.Prescription?.Brand ?? null,
  };

  const brandConstraints = detectBrandConstraints(normalized.brand_raw);

  const { error: updateError } = await supabaseServer
    .from("orders")
    .update({
      rx_ocr_raw: normalized,
      rx_ocr_meta: {
        brand_constraints: brandConstraints,
      },
      rx_status: "ocr_complete",
    })
    .eq("id", orderId)
    .eq("user_id", user.id);

  if (updateError) {
    console.error("OCR SAVE FAILED", updateError);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  console.log("OCR COMPLETE", { orderId });

  return NextResponse.json({ ok: true });
}
