import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getUserFromRequest } from "@/lib/get-user-from-request";

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

    const isAdmin = user.email === "pauldriggers@aol.com";

    const body = await req.json();
    const { status } = body;

    if (!status) {
      return new Response("Missing status", { status: 400 });
    }

    // Admin can update any order, users only their own
    let query = supabaseServer
      .from("orders")
      .update({ status })
      .eq("id", id);

    if (!isAdmin) {
      query = query.eq("user_id", user.id);
    }

    const { error } = await query;

    if (error) {
      console.error("Status update error:", error);
      return new Response("Failed to update status", { status: 500 });
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error("Status route crash:", err);
    return new Response("Server error", { status: 500 });
  }
}