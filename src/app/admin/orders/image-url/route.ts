import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/get-user-from-request";
import { supabaseServer } from "@/lib/supabase-server";

const ADMIN_EMAILS = ["pauldriggers@aol.com"];

export async function POST(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!ADMIN_EMAILS.includes(user.email ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { path } = await req.json();

  if (typeof path !== "string" || !path) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }

  const { data, error } = await supabaseServer.storage
    .from("prescriptions")
    .createSignedUrl(path, 60);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl });
}
