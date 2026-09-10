import { NextResponse } from "next/server";
import { requireAdminUser, adminAuthErrorResponse } from "@/lib/admin-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { sendAdminReceipt } from "@/lib/receipts/adminReceiptServer";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(req: Request, context: Context) {
  const auth = await requireAdminUser(req);
  if (!auth.ok) return adminAuthErrorResponse(auth);
  const { id } = await context.params;
  if (!uuid.test(id)) return NextResponse.json({ error: "Invalid order" }, { status: 400 });
  const results = await Promise.all((["receipt", "itemized"] as const).map(async type => {
    const { data, error } = await supabaseServer.from("order_events").select("after")
      .eq("order_id", id).eq("event_type", "admin_receipt_sent").eq("after->>receipt_type", type)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    return { type, sentAt: data?.after?.sent_at ?? null, error };
  }));
  if (results.some(r => r.error)) return NextResponse.json({ error: "Receipt history unavailable" }, { status: 503 });
  return NextResponse.json(Object.fromEntries(results.map(r => [r.type, r.sentAt])),
    { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request, context: Context) {
  const auth = await requireAdminUser(req);
  if (!auth.ok) return adminAuthErrorResponse(auth);
  const { id } = await context.params;
  const body = await req.json().catch(() => null);
  if (!uuid.test(id) || !body || !["receipt", "itemized"].includes(body.type) ||
      typeof body.requestId !== "string" || !uuid.test(body.requestId) || body.confirmed !== true) {
    return NextResponse.json({ error: "Confirm a valid receipt send request." }, { status: 400 });
  }
  try {
    const result = await sendAdminReceipt(id, body.type, body.requestId, auth.user.email ?? auth.user.id);
    return NextResponse.json(result, { status: result.ok ? 200 : 409 });
  } catch (error) {
    console.error("Admin receipt send stopped", { orderId: id, error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Receipt could not be sent." }, { status: 409 });
  }
}
