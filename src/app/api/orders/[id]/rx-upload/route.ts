export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "../../../../../lib/supabase-server";
import { getUserFromRequest } from "../../../../../lib/get-user-from-request";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  /* ======================================================
     1️⃣ Require authenticated user
  ====================================================== */
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const orderId = params.id;
  if (!orderId) {
    return NextResponse.json(
      { error: "Missing order id" },
      { status: 400 }
    );
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
      { status: 404 }
    );
  }

  /* ======================================================
     3️⃣ Parse multipart form data
  ====================================================== */
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json(
      { error: "No file uploaded" },
      { status: 400 }
    );
  }

  /* ======================================================
     4️⃣ Upload prescription to Supabase Storage
  ====================================================== */
  const ext = file.name.split(".").pop() || "pdf";
  const storagePath = `rx/${orderId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabaseServer.storage
    .from("prescriptions")
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: uploadError.message },
      { status: 500 }
    );
  }

  /* ======================================================
     5️⃣ Persist RX metadata on order
     (NO pricing, NO SKU, NO cart logic here)
  ====================================================== */
  const { error: updateError } = await supabaseServer
    .from("orders")
    .update({
      rx_upload_path: storagePath,
      rx_source: "upload",
      verification_status: "pending",
    })
    .eq("id", orderId);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 }
    );
  }

  /* ======================================================
     6️⃣ Success
  ====================================================== */
  return NextResponse.json({ ok: true });
}
