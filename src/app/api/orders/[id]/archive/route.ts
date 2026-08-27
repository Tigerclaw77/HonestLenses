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

    const { data, error } = await supabaseServer.rpc(
      "founder_complete_archive_order",
      {
        p_order_id: id,
        p_actor: auth.user.email ?? auth.user.id,
      },
    );

    if (error) {
      console.error("Founder complete/archive error:", error);
      const status = error.code === "P0002" ? 404 : 500;
      return new Response(
        status === 404 ? "Order not found" : "Failed to complete/archive order",
        { status },
      );
    }

    if (!data) {
      return new Response("Order not found or not authorized", { status: 404 });
    }

    return Response.json({ success: true, order: data });
  } catch (err) {
    console.error("Archive route crash:", err);
    return new Response("Server error", { status: 500 });
  }
}
