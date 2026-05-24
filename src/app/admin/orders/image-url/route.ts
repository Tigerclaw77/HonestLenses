import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  adminAuthErrorResponse,
  logAdminAuthFailure,
  requireAdminUser,
} from "@/lib/admin-auth";

export async function POST(req: Request) {
  const auth = await requireAdminUser(req);
  if (!auth.ok) {
    logAdminAuthFailure("POST /admin/orders/image-url", auth);
    return adminAuthErrorResponse(auth);
  }

  const body = (await req.json().catch(() => ({}))) as { path?: unknown };
  const path = body.path;

  if (typeof path !== "string" || !path) {
    return NextResponse.json(
      { error: "Missing path", code: "missing_path" },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseServer.storage
    .from("prescriptions")
    .createSignedUrl(path, 60);

  if (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[admin rx image] signed URL generation failed", {
        path,
        userId: auth.user.id,
        authSource: auth.authSource,
        adminSource: auth.adminSource,
        error: error.message,
      });
    }

    return NextResponse.json(
      { error: error.message, code: "signed_url_failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ url: data.signedUrl });
}
