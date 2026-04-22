export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "../../../../../lib/supabase-server";
import { getUserFromRequest } from "../../../../../lib/get-user-from-request";

/* =========================
   TYPES
========================= */

type ParsedRx = {
  left?: {
    sphere?: number | string;
    cylinder?: number | string;
    axis?: number | string;
    base_curve?: string;
    diameter?: string;
    add?: string;
  };
  right?: {
    sphere?: number | string;
    cylinder?: number | string;
    axis?: number | string;
    base_curve?: string;
    diameter?: string;
    add?: string;
  };
  brand_raw?: string;
  expires?: string;
};

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: orderId } = await context.params;

  /* =========================
     1) Auth
  ========================= */

  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!orderId) {
    return NextResponse.json({ error: "Missing order id" }, { status: 400 });
  }

  /* ======================================================
     2️⃣ Ensure order exists and belongs to user
  ====================================================== */

  const { data: order, error: orderError } = await supabaseServer
    .from("orders")
    .select("id")
    .eq("id", orderId)
    .eq("user_id", user.id)
    .single();

  if (orderError || !order) {
    console.error("ORDER LOOKUP FAILED", {
      orderId,
      userId: user.id,
      orderError,
    });
    return NextResponse.json(
      { error: "Order not found or not owned by user" },
      { status: 404 },
    );
  }

  /* ======================================================
     3️⃣ Parse multipart form data
  ====================================================== */

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  console.log("RX UPLOAD START", {
    orderId,
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size,
  });

  /* ======================================================
     4️⃣ Convert File → Buffer
  ====================================================== */

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";

  /* ======================================================
     5️⃣ Storage path
  ====================================================== */

  const storagePath = `rx/${orderId}/original.${ext}`;

  /* ======================================================
     6️⃣ Upload to Supabase Storage
  ====================================================== */

  const { error: uploadError } = await supabaseServer.storage
    .from("prescriptions")
    .upload(storagePath, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: true,
    });

  if (uploadError) {
    console.error("UPLOAD FAILED", uploadError);
    return NextResponse.json(
      { error: "Upload failed: " + uploadError.message },
      { status: 500 },
    );
  }

  /* ======================================================
     7️⃣ AI PARSE
  ====================================================== */

  const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/prescriptions/${storagePath}`;

  const aiRes = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Extract contact lens prescription. Return JSON:
{
  left: { sphere, cylinder, axis, base_curve, diameter, add },
  right: { sphere, cylinder, axis, base_curve, diameter, add },
  brand_raw,
  expires
}`,
            },
            {
              type: "input_image",
              image_url: publicUrl,
            },
          ],
        },
      ],
    }),
  });

  const aiData = await aiRes.json();

  console.log("AI RAW RESPONSE", aiData);

  const text = aiData.output?.[0]?.content?.[0]?.text ?? "{}";

  let parsed: ParsedRx = {};

  try {
    const temp = JSON.parse(text);

    if (typeof temp === "object" && temp !== null) {
      parsed = temp as ParsedRx;
    }
  } catch (err: unknown) {
    console.error("AI PARSE FAILED", text);

    if (err instanceof Error) {
      console.error("PARSE ERROR", err.message);
    }
  }

  /* ======================================================
     8️⃣ SAVE FINAL RX (SOURCE OF TRUTH)
  ====================================================== */

  const { error: updateError } = await supabaseServer
    .from("orders")
    .update({
      rx_upload_path: storagePath,
      rx_source: "upload",
      rx: parsed,
      verification_status: "auto_verified",
    })
    .eq("id", orderId);

  if (updateError) {
    console.error("ORDER UPDATE FAILED", updateError);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  /* ======================================================
     9️⃣ Success
  ====================================================== */

  console.log("RX UPLOAD + AI PARSE SUCCESS", {
    orderId,
    storagePath,
    parsed,
  });

  return NextResponse.json({
    ok: true,
    path: storagePath,
  });
}