import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getUserFromRequest } from "@/lib/get-user-from-request";

type ShippingBody = {
  shipping_first_name?: string;
  shipping_last_name?: string;
  shipping_email?: string;
  shipping_phone?: string;

  shipping_address1?: string;
  shipping_address2?: string;
  shipping_city?: string;
  shipping_state?: string;
  shipping_zip?: string;
};

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: orderId } = await context.params;
  const body = (await req.json()) as ShippingBody;

  // You said you are NOT collecting phone from shipping
  // so we ignore shipping_phone even if it is present.
  const update = {
    shipping_first_name: body.shipping_first_name?.trim() || null,
    shipping_last_name: body.shipping_last_name?.trim() || null,

    shipping_email: body.shipping_email?.trim().toLowerCase() || null,
    shipping_phone: body.shipping_phone?.trim() || null,

    shipping_address1: body.shipping_address1?.trim() || null,
    shipping_address2: body.shipping_address2?.trim() || null,
    shipping_city: body.shipping_city?.trim() || null,
    shipping_state: body.shipping_state?.trim() || null,
    shipping_zip: body.shipping_zip?.trim() || null,
  };

  const { data, error } = await supabaseServer
    .from("orders")
    .update(update)
    .eq("id", orderId)
    .eq("user_id", user.id)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json(
      { error: "Order not found or not editable." },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true });
}
