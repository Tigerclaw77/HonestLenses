import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  adminAuthErrorResponse,
  logAdminAuthFailure,
  requireAdminUser,
} from "@/lib/admin-auth";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const auth = await requireAdminUser(req);
    if (!auth.ok) {
      logAdminAuthFailure("POST /api/orders/[id]/archive", auth);
      return adminAuthErrorResponse(auth);
    }

    const query = supabaseServer
      .from("orders")
      .update({
        archived: true,
        archived_at: new Date().toISOString(),
      })
      .eq("id", id);

    const { data, error } = await query.select("id").maybeSingle();

    if (error) {
      console.error("Archive error:", error);
      return new Response("Failed to archive order", { status: 500 });
    }

    if (!data) {
      return new Response("Order not found or not authorized", { status: 404 });
    }

    await supabaseServer.from("order_events").insert({
      order_id: id,
      event_type: "admin_order_archived",
      actor: auth.user.email ?? auth.user.id,
    });

    return Response.json({ success: true });
  } catch (err) {
    console.error("Archive route crash:", err);
    return new Response("Server error", { status: 500 });
  }
}
