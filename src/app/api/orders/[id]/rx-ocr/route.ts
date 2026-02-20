export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { supabaseServer } from "../../../../../lib/supabase-server";
import { getUserFromRequest } from "../../../../../lib/get-user-from-request";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: orderId } = await context.params;

  /* =========================
     1️⃣ Auth
  ========================= */

  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!orderId) {
    return NextResponse.json({ error: "Missing order id" }, { status: 400 });
  }

  /* =========================
     2️⃣ Confirm ownership
  ========================= */

  const { data: order, error } = await supabaseServer
    .from("orders")
    .select("id, rx_upload_path")
    .eq("id", orderId)
    .eq("user_id", user.id)
    .single();

  if (error || !order) {
    return NextResponse.json(
      { error: "Order not found or not owned by user" },
      { status: 404 }
    );
  }

  if (!order.rx_upload_path) {
    return NextResponse.json(
      { error: "No uploaded prescription found" },
      { status: 400 }
    );
  }

  /* =========================
     3️⃣ Fetch image from Supabase Storage
  ========================= */

  const { data: fileData, error: fileError } =
    await supabaseServer.storage
      .from("prescriptions")
      .download(order.rx_upload_path);

  if (fileError || !fileData) {
    return NextResponse.json(
      { error: "Failed to retrieve uploaded file" },
      { status: 500 }
    );
  }

  const buffer = Buffer.from(await fileData.arrayBuffer());
  const base64Image = buffer.toString("base64");

  /* =========================
     4️⃣ OpenAI Vision Extraction
  ========================= */

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [
      {
        role: "system",
        content:
          "You extract structured contact lens prescription data from images. Return strict JSON only.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `
Extract contact lens prescription fields.

Return JSON in this format:

{
  expires: string,
  patient_name: string,
  prescriber_name: string,
  prescriber_phone: string,
  right: {
    sphere: string,
    cylinder: string,
    axis: string,
    add: string,
    base_curve: string
  },
  left: {
    sphere: string,
    cylinder: string,
    axis: string,
    add: string,
    base_curve: string
  }
}
            `,
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${base64Image}`,
            },
          },
        ],
      },
    ],
  });

  let parsed;
  try {
    parsed = JSON.parse(response.choices[0].message.content ?? "{}");
  } catch {
    return NextResponse.json(
      { error: "Failed to parse OCR response" },
      { status: 500 }
    );
  }

  /* =========================
     5️⃣ Transform To RxDraft Shape
  ========================= */

  const draft = {
    expires: parsed.expires ?? "",
    right: {
      lens_id: "",
      sph: parsed.right?.sphere ?? "",
      cyl: parsed.right?.cylinder ?? "",
      axis: parsed.right?.axis ?? "",
      add: parsed.right?.add ?? "",
      bc: parsed.right?.base_curve ?? "",
      color: "",
    },
    left: {
      lens_id: "",
      sph: parsed.left?.sphere ?? "",
      cyl: parsed.left?.cylinder ?? "",
      axis: parsed.left?.axis ?? "",
      add: parsed.left?.add ?? "",
      bc: parsed.left?.base_curve ?? "",
      color: "",
    },
  };

  return NextResponse.json({
    draft,
    meta: {
      patient_name: parsed.patient_name ?? "",
      prescriber_name: parsed.prescriber_name ?? "",
      prescriber_phone: parsed.prescriber_phone ?? "",
    },
  });
}