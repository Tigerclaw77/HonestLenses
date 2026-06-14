export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { setGuestOrderCookie } from "@/lib/order-access";
import {
  getResumeDestination,
  hashOrderResumeToken,
  normalizeRecoveryEmail,
  type RecoverableOrder,
} from "@/lib/order-recovery";
import { supabaseServer } from "@/lib/supabase-server";

type ResumeTokenRow = {
  id: string;
  order_id: string;
  email: string;
  expires_at: string;
  used_at: string | null;
};

function redirectToStatus(req: NextRequest, status: "expired" | "invalid") {
  return NextResponse.redirect(new URL(`/resume-order?status=${status}`, req.url));
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")?.trim();

  if (!token) {
    return redirectToStatus(req, "invalid");
  }

  const tokenHash = hashOrderResumeToken(token);
  const now = new Date().toISOString();

  const { data: tokenRow, error: tokenError } = await supabaseServer
    .from("order_resume_tokens")
    .select("id, order_id, email, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .is("used_at", null)
    .gt("expires_at", now)
    .maybeSingle<ResumeTokenRow>();

  if (tokenError || !tokenRow) {
    return redirectToStatus(req, "expired");
  }

  const { data: consumed, error: consumeError } = await supabaseServer
    .from("order_resume_tokens")
    .update({ used_at: now })
    .eq("id", tokenRow.id)
    .is("used_at", null)
    .select("id")
    .maybeSingle();

  if (consumeError || !consumed) {
    return redirectToStatus(req, "expired");
  }

  const { data: order, error: orderError } = await supabaseServer
    .from("orders")
    .select(
      `
      id,
      status,
      rx,
      rx_upload_path,
      rx_source,
      verification_status,
      payment_intent_id,
      shipping_email,
      shipping_first_name,
      shipping_last_name,
      shipping_address1,
      shipping_city,
      shipping_state,
      shipping_zip,
      sku,
      total_amount_cents
    `,
    )
    .eq("id", tokenRow.order_id)
    .eq("shipping_email", normalizeRecoveryEmail(tokenRow.email))
    .maybeSingle<RecoverableOrder>();

  if (orderError || !order) {
    return redirectToStatus(req, "expired");
  }

  const destination = getResumeDestination(order);
  if (!destination) {
    return redirectToStatus(req, "expired");
  }

  const response = NextResponse.redirect(new URL(destination.path, req.url));
  return setGuestOrderCookie(response, order.id);
}
