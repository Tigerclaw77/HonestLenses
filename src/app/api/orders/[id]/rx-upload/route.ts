export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "../../../../../lib/supabase-server";
import { getUserFromRequest } from "../../../../../lib/get-user-from-request";

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

  const storagePath = `rx/${orderId}/${crypto.randomUUID()}.${ext}`;

  /* ======================================================
     5️⃣ Upload to Supabase Storage
  ====================================================== */

  const { data: uploadData, error: uploadError } = await supabaseServer.storage
    .from("prescriptions")
    .upload(storagePath, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  console.log("UPLOAD RESULT", {
    storagePath,
    uploadData,
    uploadError,
  });

  if (uploadError) {
    console.error("UPLOAD FAILED", uploadError);
    return NextResponse.json(
      { error: "Upload failed: " + uploadError.message },
      { status: 500 },
    );
  }

  /* ======================================================
     6️⃣ Persist RX metadata on order
  ====================================================== */

  const { error: updateError } = await supabaseServer
    .from("orders")
    .update({
      rx_upload_path: storagePath,
      rx_source: "upload",
      verification_status: "verified",
    })
    .eq("id", orderId);

  if (updateError) {
    console.error("ORDER UPDATE FAILED", updateError);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // 🔥 TRIGGER OCR (THIS IS THE MISSING LINK)
  try {
    const res = await fetch(
      `${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"}/api/orders/${orderId}/rx-ocr`,
      {
        method: "POST",
        headers: {
          cookie: req.headers.get("cookie") || "",
        },
      },
    );

    console.log("OCR TRIGGER RESPONSE", await res.text());
  } catch (err) {
    console.error("OCR trigger failed", err);
  }

  /* ======================================================
     7️⃣ Success
  ====================================================== */

  console.log("RX UPLOAD SUCCESS", { orderId, storagePath });

  return NextResponse.json({
    ok: true,
    path: storagePath, // 👈 useful for debugging + future preview UI
  });
}
