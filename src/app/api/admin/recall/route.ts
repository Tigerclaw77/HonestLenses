import { NextResponse } from "next/server";
import { requireAdminUser, adminAuthErrorResponse } from "@/lib/admin-auth";
import { commercialEmailHash } from "@/lib/orderOperations";
import { previewReorderRecall } from "@/lib/reorder/recallRunner";
import { supabaseServer as db } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireAdminUser(request);
  if (!auth.ok) return adminAuthErrorResponse(auth);
  try {
    const preview = await previewReorderRecall();
    const control = await db.from("order_operations_control")
      .select("reorder_recall_compliance_approved_at")
      .eq("id", true).single();
    if (control.error) throw control.error;
    return NextResponse.json({ ...preview,
      canResume: Boolean(control.data?.reorder_recall_compliance_approved_at) },
      { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Recall preview unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminUser(request);
  if (!auth.ok) return adminAuthErrorResponse(auth);
  const body = await request.json().catch(() => null);
  if (body?.action === "pause") {
    const { error } = await db.from("order_operations_control")
      .update({ reorder_reminders_enabled: false }).eq("id", true);
    return NextResponse.json({ ok: !error }, { status: error ? 503 : 200 });
  }
  if (body?.action === "resume") {
    if (body.confirm !== true) return NextResponse.json({ error: "Confirmation required." }, { status: 400 });
    const { data: control, error: readError } = await db.from("order_operations_control")
      .select("reorder_recall_compliance_approved_at,postal_address")
      .eq("id", true).single();
    if (readError || !control) return NextResponse.json({ error: "Recall control unavailable." }, { status: 503 });
    if (!control.reorder_recall_compliance_approved_at || !control.postal_address?.trim()) {
      return NextResponse.json({ error: "Compliance and sender review must be approved before live sending." }, { status: 409 });
    }
    const { error } = await db.from("order_operations_control")
      .update({ reorder_reminders_enabled: true,
        reorder_recall_live_from: new Date().toISOString() }).eq("id", true);
    return NextResponse.json({ ok: !error }, { status: error ? 503 : 200 });
  }
  if (body?.action === "suppress" && typeof body.orderId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(body.orderId)) {
    const lookup = await db.from("orders").select("shipping_email").eq("id", body.orderId).maybeSingle();
    if (lookup.error) return NextResponse.json({ error: "Order lookup unavailable." }, { status: 503 });
    if (!lookup.data?.shipping_email) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    const hash = commercialEmailHash(lookup.data.shipping_email);
    const suppression = await db.from("commercial_email_suppressions")
      .upsert({ email_hash: hash, reason: "admin_recall_suppression" },
        { onConflict: "email_hash", ignoreDuplicates: true });
    if (suppression.error) return NextResponse.json({ error: "Suppression unavailable." }, { status: 503 });
    const stopped = await db.from("reorder_reminder_preferences")
      .update({ stopped_at: new Date().toISOString(), next_reminder_at: null,
        next_expiration_at: null }).eq("email_hash", hash);
    return NextResponse.json({ ok: !stopped.error }, { status: stopped.error ? 503 : 200 });
  }
  return NextResponse.json({ error: "Invalid recall action." }, { status: 400 });
}
