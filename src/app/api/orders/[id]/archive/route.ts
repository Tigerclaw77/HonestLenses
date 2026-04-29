import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getUserFromRequest } from "@/lib/get-user-from-request";

const ADMIN_EMAILS = ["pauldriggers@aol.com"];

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const user = await getUserFromRequest(req);

    if (!user) {
      return new Response("Unauthorized", { status: 401 });
    }

    const isAdmin = ADMIN_EMAILS.includes(user.email ?? "");

    let query = supabaseServer
      .from("orders")
      .update({
        archived: true,
        archived_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (!isAdmin) {
      query = query.eq("user_id", user.id);
    }

    const { data, error } = await query.select("id").maybeSingle();

    if (error) {
      console.error("Archive error:", error);
      return new Response("Failed to archive order", { status: 500 });
    }

    if (!data) {
      return new Response("Order not found or not authorized", { status: 404 });
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error("Archive route crash:", err);
    return new Response("Server error", { status: 500 });
  }
}