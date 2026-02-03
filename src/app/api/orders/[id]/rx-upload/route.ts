export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "../../../../../lib/supabase-server";
import { getUserFromRequest } from "../../../../../lib/get-user-from-request";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  // 1️⃣ Auth
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orderId = params.id;

  // 2️⃣ Ensure order belongs to user
  const { data: order, error: orderError } = await supabaseServer
    .from("orders")
    .select("id")
    .eq("id", orderId)
    .eq("user_id", user.id)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // 3️⃣ Parse multipart form
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  // 4️⃣ Upload to Supabase Storage
  const fileExt = file.name.split(".").pop();
  const storagePath = `rx/${orderId}/${crypto.randomUUID()}.${fileExt}`;

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

  // 5️⃣ Save RX metadata on order
  const { error: updateError } = await supabaseServer
    .from("orders")
    .update({
      rx_upload_path: storagePath,
      verification_status: "pending",
      rx_source: "upload",
    })
    .eq("id", orderId);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
