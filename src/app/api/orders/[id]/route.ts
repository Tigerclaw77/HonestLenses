export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "../../../../lib/supabase-server";
import {
  canAccessOrder,
  getOrderAccess,
  hasOrderAccessContext,
} from "@/lib/order-access";

type OrderRow = {
  id: string;
  status: string;
  total_amount_cents: number | null;
  revised_total_amount_cents: number | null;
  verification_status: string | null;
  price_reason: string | null;
  rx: unknown;
  rx_ocr_raw: unknown;
  user_id: string | null;
  manufacturer: string | null;
  sku: string | null;
  shipping_method: string | null;
  shipping_cents: number | null;
  payment_intent_id: string | null;
  feedback_credit_cents: number | null;
  feedback_credit_applied_at: string | null;
  feedback_survey_completed_at: string | null;
  rx_upload_path: string | null;
  rx_source: string | null;
  shipping_first_name: string | null;
  shipping_last_name: string | null;
  shipping_address1: string | null;
  shipping_address2: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  shipping_zip: string | null;
};

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  /* =========================
     1) Auth
  ========================= */

  const access = await getOrderAccess(req);
  if (!hasOrderAccessContext(access)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  /* =========================
     2) Extract params (Next 16 style)
  ========================= */

  const { id: orderId } = await context.params;

  if (!orderId) {
    return NextResponse.json({ error: "Missing order id" }, { status: 400 });
  }

  /* =========================
     3) Load order
  ========================= */

  const { data: order, error } = await supabaseServer
    .from("orders")
    .select(
      `
      id,
      status,
      total_amount_cents,
      revised_total_amount_cents,
      verification_status,
      price_reason,
      rx,
      rx_ocr_raw,
      user_id,
      manufacturer,
      sku,
      shipping_method,
      shipping_cents,
      payment_intent_id,
      feedback_credit_cents,
      feedback_credit_applied_at,
      feedback_survey_completed_at,
      rx_upload_path,
      rx_source,
      shipping_first_name,
      shipping_last_name,
      shipping_address1,
      shipping_address2,
      shipping_city,
      shipping_state,
      shipping_zip
    `
    )
    .eq("id", orderId)
    .single<OrderRow>();

  if (error || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (!canAccessOrder(access, order)) {
    return NextResponse.json(
      { error: "Order not authorized" },
      { status: 403 }
    );
  }

  return NextResponse.json({
    order: {
      id: order.id,
      status: order.status,
      total_amount_cents: order.total_amount_cents,
      revised_total_amount_cents: order.revised_total_amount_cents,
      verification_status: order.verification_status,
      price_reason: order.price_reason,
      rx: order.rx,
      rx_ocr_raw: order.rx_ocr_raw,
      manufacturer: order.manufacturer,
      sku: order.sku,
      shipping_method: order.shipping_method,
      shipping_cents: order.shipping_cents,
      payment_intent_id: order.payment_intent_id,
      feedback_credit_cents: order.feedback_credit_cents,
      feedback_credit_applied_at: order.feedback_credit_applied_at,
      feedback_survey_completed_at: order.feedback_survey_completed_at,
      rx_upload_path: order.rx_upload_path,
      rx_source: order.rx_source,
      shipping_first_name: order.shipping_first_name,
      shipping_last_name: order.shipping_last_name,
      shipping_address1: order.shipping_address1,
      shipping_address2: order.shipping_address2,
      shipping_city: order.shipping_city,
      shipping_state: order.shipping_state,
      shipping_zip: order.shipping_zip,
    },
  });
}
