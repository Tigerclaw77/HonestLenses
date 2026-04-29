import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getUserFromRequest } from "@/lib/get-user-from-request";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserFromRequest(req);

    if (!user) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { status } = await req.json();

    if (!status) {
      return new Response("Missing status", { status: 400 });
    }

    const isAdmin = user.email === "pauldriggers@aol.com";

    // Build query - admin can update any order, users only their own
    let query = supabaseServer
      .from("orders")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.id);

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