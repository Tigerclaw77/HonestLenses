export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "../../../../lib/supabase-server";
import { getUserFromRequest } from "../../../../lib/get-user-from-request";

type RouteParams = {
  params: {
    id: string;
  };
};

export async function GET(req: Request, { params }: RouteParams) {
  try {
    // 1️⃣ Require authenticated user
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const orderId = params.id;
    if (!orderId) {
      return NextResponse.json(
        { error: "Missing order id" },
        { status: 400 }
      );
    }

    // 2️⃣ Fetch order owned by user (INCLUDING rx)
    const { data: order, error } = await supabaseServer
      .from("orders")
      .select(`
        id,
        status,
        total_amount_cents,
        revised_total_amount_cents,
        verification_status,
        price_reason,
        rx
      `)
      .eq("id", orderId)
      .eq("user_id", user.id)
      .single();

    if (error) {
      console.error("Order fetch error:", error);
      return NextResponse.json(
        { error: "Failed to fetch order" },
        { status: 500 }
      );
    }

    if (!order) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    // 3️⃣ Canonical JSON response
    return NextResponse.json(
      { order },
      { status: 200 }
    );
  } catch (err) {
    console.error("GET /api/orders/[id] crash:", err);
    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 }
    );
  }
}
