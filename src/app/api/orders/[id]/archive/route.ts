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

    let requestedArchived = true;
    try {
      const body = (await req.json()) as { archived?: unknown };
      if (typeof body.archived === "boolean") requestedArchived = body.archived;
    } catch {
      // Existing callers without a JSON body continue to archive.
    }

    const { data: currentOrder, error: currentError } = await supabaseServer
      .from("orders")
      .select("id, archived, archived_at")
      .eq("id", id)
      .maybeSingle();

    if (currentError) {
      console.error("Archive lookup error:", currentError);
      return new Response("Failed to load order", { status: 500 });
    }
    if (!currentOrder) {
      return new Response("Order not found or not authorized", { status: 404 });
    }
    if (Boolean(currentOrder.archived) === requestedArchived) {
      return Response.json({ success: true, already_done: true });
    }

    const query = supabaseServer
      .from("orders")
      .update({
        archived: requestedArchived,
        archived_at: requestedArchived ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
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
      event_type: requestedArchived
        ? "admin_order_archived"
        : "admin_order_restored",
      actor: auth.user.email ?? auth.user.id,
      before: {
        archived: currentOrder.archived,
        archived_at: currentOrder.archived_at,
      },
      after: {
        archived: requestedArchived,
        archived_at: requestedArchived ? "recorded_at_action_time" : null,
      },
    });

    return Response.json({ success: true, already_done: false });
  } catch (err) {
    console.error("Archive route crash:", err);
    return new Response("Server error", { status: 500 });
  }
}
