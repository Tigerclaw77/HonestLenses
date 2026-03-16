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

  /* ======================================================
     4️⃣ Convert File → Buffer
     (more reliable for Supabase Storage in Node runtime)
  ====================================================== */

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const ext = file.name.split(".").pop() || "pdf";

  const storagePath = `rx/${orderId}/${crypto.randomUUID()}.${ext}`;

  /* ======================================================
     5️⃣ Upload prescription to Supabase Storage
  ====================================================== */

  const { error: uploadError } = await supabaseServer.storage
    .from("prescriptions")
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: uploadError.message },
      { status: 500 },
    );
  }

  /* ======================================================
     6️⃣ Persist RX metadata on order
     (uploads count as verified in your workflow)
  ====================================================== */

  const { error: updateError } = await supabaseServer
    .from("orders")
    .update({
      rx_upload_path: storagePath,
      rx_upload_filename: file.name,
      rx_upload_size: file.size,
      rx_source: "upload",
      verification_status: "verified",
    })
    .eq("id", orderId);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 },
    );
  }

  /* ======================================================
     7️⃣ Success
  ====================================================== */

  return NextResponse.json({ ok: true });
}