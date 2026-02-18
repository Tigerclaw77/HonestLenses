import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getUserFromRequest } from "@/lib/get-user-from-request";

export async function POST(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderId } = await req.json();

  if (!orderId) {
    return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
  }

  const { error } = await supabaseServer
    .from("orders")
    .update({
      verification_requested_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabaseServer.from("order_events").insert({
    order_id: orderId,
    event_type: "verification_requested",
    actor: "system",
  });

  return NextResponse.json({ success: true });
}
