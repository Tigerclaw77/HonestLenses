export const runtime = "nodejs";

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { adminAuthErrorResponse, requireAdminUser } from "@/lib/admin-auth";
import { validateCatalogImageUpload } from "@/lib/security/uploadValidation";
import { supabaseServer } from "@/lib/supabase-server";

const CORE_ID = /^[A-Z0-9_]+$/;

export async function POST(request: Request) {
  const auth = await requireAdminUser(request);
  if (!auth.ok) return adminAuthErrorResponse(auth);
  try {
    const form = await request.formData();
    const coreId = typeof form.get("coreId") === "string" ? String(form.get("coreId")).trim() : "";
    const file = form.get("file");
    if (!CORE_ID.test(coreId) || !(file instanceof File)) return NextResponse.json({ error: "A valid core ID and image file are required." }, { status: 400 });
    const image = await validateCatalogImageUpload(file);
    const storagePath = `families/${coreId}/${randomUUID()}.${image.extension}`;
    const { error } = await supabaseServer.storage.from("catalog-images").upload(storagePath, image.buffer, { contentType: image.mimeType, cacheControl: "31536000", upsert: false });
    if (error) throw error;
    const { data } = supabaseServer.storage.from("catalog-images").getPublicUrl(storagePath);
    return NextResponse.json({ storagePath, publicUrl: data.publicUrl });
  } catch (error) {
    console.error("Unable to upload catalog image", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to upload catalog image." }, { status: 400 });
  }
}
