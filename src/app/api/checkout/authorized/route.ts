export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseServer } from "../../../../lib/supabase-server";
import { getUserFromRequest } from "../../../../lib/get-user-from-request";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function getString(o: UnknownRecord, key: string): string | null {
  const v = o[key];
  return typeof v === "string" ? v : null;
}

function getBoolean(o: UnknownRecord, key: string): boolean | null {
  const v = o[key];
  return typeof v === "boolean" ? v : null;
}

function looksLikeUploadMode(order: unknown): boolean {
  if (!isRecord(order)) return false;

  // Primary (you referenced this earlier)
  if (getBoolean(order, "rx_upload_order_d") === true) return true;

  // Optional signals (only if present in your schema)
  const keys = ["rx_mode", "verification_mode", "rx_source", "mode"];
  for (const k of keys) {
    const v = getString(order, k);
    if (!v) continue;
    const s = v.toLowerCase();
    if (s.includes("upload") || s.includes("uploaded") || s.includes("ocr")) return true;
  }

  return false;
}

export async function POST(req: Request) {
  // 1️⃣ Auth
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2️⃣ Load latest draft order for this user
  // Use select("*") so we can detect mode without risking “column does not exist” errors.
  const { data: orderRaw, error } = await supabaseServer
    .from("orders")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!orderRaw || !isRecord(orderRaw)) {
    return NextResponse.json({ error: "No draft order" }, { status: 400 });
  }

  const orderId = getString(orderRaw, "id");
  const paymentIntentId = getString(orderRaw, "payment_intent_id");

  if (!orderId) {
    return NextResponse.json({ error: "Order is missing id" }, { status: 500 });
  }

  if (!paymentIntentId) {
    return NextResponse.json(
      { error: "Missing Stripe PaymentIntent" },
      { status: 400 },
    );
  }

  // 3️⃣ Retrieve PaymentIntent and verify it is authorized (manual capture)
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);

  // Extra safety: ensure PI metadata matches this order
  const metaOrderId =
    typeof intent.metadata?.order_id === "string"
      ? intent.metadata.order_id
      : null;

  if (metaOrderId && metaOrderId !== orderId) {
    return NextResponse.json(
      { error: "PaymentIntent does not match this order" },
      { status: 400 },
    );
  }

  if (intent.status !== "requires_capture") {
    return NextResponse.json(
      { error: `Payment not authorized (status: ${intent.status})` },
      { status: 400 },
    );
  }

  // 4️⃣ Decide flow based on mode
  const isUploaded = looksLikeUploadMode(orderRaw);

  const updatePayload: Record<string, unknown> = {
    status: "authorized",
    verification_status: isUploaded ? "verified" : "pending",
  };

  const { error: updateError } = await supabaseServer
    .from("orders")
    .update(updatePayload)
    .eq("id", orderId)
    .eq("user_id", user.id)
    .eq("status", "draft"); // prevent double-flips/races

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // 5️⃣ Tell the client where to go next
  if (isUploaded) {
    return NextResponse.json({
      ok: true,
      orderId,
      next: "success",
      mode: "uploaded",
    });
  }

  return NextResponse.json({
    ok: true,
    orderId,
    next: "verification-details",
    mode: "passive",
  });
}