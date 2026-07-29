import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  canAccessOrder,
  getOrderAccess,
  hasOrderAccessContext,
} from "@/lib/order-access";
import {
  boundedText,
  isEmailAddress,
  isUsPostalCode,
  isUsState,
} from "@/lib/security/inputValidation";

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
  const access = await getOrderAccess(req);
  if (!hasOrderAccessContext(access)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: orderId } = await context.params;
  const body = (await req.json().catch(() => null)) as ShippingBody | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const { data: order, error: orderError } = await supabaseServer
    .from("orders")
    .select("id, user_id, status")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError || !order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  if (!canAccessOrder(access, order)) {
    return NextResponse.json({ error: "Order not authorized." }, { status: 403 });
  }

  if (order.status !== "draft") {
    return NextResponse.json(
      { error: "Order not found or not editable." },
      { status: 404 },
    );
  }

  const firstName = boundedText(body.shipping_first_name, 100, true);
  const lastName = boundedText(body.shipping_last_name, 100, true);
  const email = boundedText(body.shipping_email, 254, true)?.toLowerCase();
  const phone = boundedText(body.shipping_phone, 30);
  const address1 = boundedText(body.shipping_address1, 200, true);
  const address2 = boundedText(body.shipping_address2, 200);
  const city = boundedText(body.shipping_city, 100, true);
  const state = boundedText(body.shipping_state, 2, true)?.toUpperCase();
  const zip = boundedText(body.shipping_zip, 10, true);

  if (
    !firstName ||
    !lastName ||
    !email ||
    !isEmailAddress(email) ||
    phone === null ||
    !address1 ||
    address2 === null ||
    !city ||
    !state ||
    !isUsState(state) ||
    !zip ||
    !isUsPostalCode(zip)
  ) {
    return NextResponse.json(
      { error: "Invalid shipping details." },
      { status: 400 },
    );
  }

  const update = {
    shipping_first_name: firstName,
    shipping_last_name: lastName,
    shipping_email: email,
    shipping_phone: phone || null,
    shipping_address1: address1,
    shipping_address2: address2 || null,
    shipping_city: city,
    shipping_state: state,
    shipping_zip: zip,
  };

  const { data, error } = await supabaseServer
    .from("orders")
    .update(update)
    .eq("id", orderId)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Unable to save shipping details." }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json(
      { error: "Order not found or not editable." },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true });
}
