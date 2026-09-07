export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";

import { setGuestOrderCookie } from "@/lib/order-access";
import {
  hashOrderResumeToken,
  normalizeRecoveryEmail,
  type RecoverableOrder,
} from "@/lib/order-recovery";
import { supabaseServer } from "@/lib/supabase-server";
import { getVerifiedResumeDestination, RECOVERY_ORDER_FIELDS } from "@/lib/recoveryServer";

type ResumeTokenRow = {
  id: string;
  order_id: string;
  email: string;
};

type CartSaveTokenRow = {
  id: string;
  order_id: string;
};

function protectRedirect(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

function redirectToStatus(req: NextRequest, status: "expired" | "invalid") {
  return protectRedirect(
    NextResponse.redirect(new URL(`/resume-order?status=${status}`, req.url)),
  );
}

async function consumeToken(
  table: "order_resume_tokens",
  id: string,
  now: string,
) {
  const { data, error } = await supabaseServer
    .from(table)
    .update({ used_at: now })
    .eq("id", id)
    .is("used_at", null)
    .select("id")
    .maybeSingle();

  return !error && Boolean(data);
}

async function getRecoverableOrder(
  orderId: string,
  expectedEmail?: string,
) {
  let query = supabaseServer
    .from("orders")
    .select(
      RECOVERY_ORDER_FIELDS,
    )
    .eq("id", orderId);

  if (expectedEmail) {
    query = query.eq("shipping_email", normalizeRecoveryEmail(expectedEmail));
  }

  const { data, error } = await query.maybeSingle<RecoverableOrder>();
  return error ? null : data;
}

async function completeRecovery(req: NextRequest, order: RecoverableOrder) {
  const destination = await getVerifiedResumeDestination(order).catch(() => null);
  if (!destination) return redirectToStatus(req, "expired");

  const response = protectRedirect(
    NextResponse.redirect(new URL(destination.path, req.url)),
  );
  return setGuestOrderCookie(response, order.id);
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")?.trim();
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return redirectToStatus(req, "invalid");

  let tokenHash: string;
  try {
    tokenHash = hashOrderResumeToken(token);
  } catch {
    return redirectToStatus(req, "invalid");
  }

  const now = new Date().toISOString();
  const { data: resumeToken, error: resumeTokenError } = await supabaseServer
    .from("order_resume_tokens")
    .select("id, order_id, email")
    .eq("token_hash", tokenHash)
    .is("used_at", null)
    .gt("expires_at", now)
    .maybeSingle<ResumeTokenRow>();

  if (resumeTokenError) return redirectToStatus(req, "expired");

  if (resumeToken) {
    if (!(await consumeToken("order_resume_tokens", resumeToken.id, now))) {
      return redirectToStatus(req, "expired");
    }

    const order = await getRecoverableOrder(resumeToken.order_id, resumeToken.email);
    return order ? completeRecovery(req, order) : redirectToStatus(req, "expired");
  }

  const { data: cartSaveToken, error: cartSaveTokenError } = await supabaseServer
    .from("cart_save_tokens")
    .select("id, order_id")
    .eq("token_hash", tokenHash)
    .gt("expires_at", now)
    .maybeSingle<CartSaveTokenRow>();

  if (cartSaveTokenError) {
    return redirectToStatus(req, "expired");
  }

  if (!cartSaveToken) {
    const { data: draft, error } = await supabaseServer.from("recovery_touch_drafts")
      .select("order_id,email").eq("token_hash", tokenHash).gt("expires_at", now).maybeSingle();
    if (error || !draft) return redirectToStatus(req, "expired");
    const order = await getRecoverableOrder(draft.order_id, draft.email);
    return order ? completeRecovery(req, order) : redirectToStatus(req, "expired");
  }

  // A cart-save token is delivered directly to the requested inbox. Unlike
  // ordinary order-resume tokens it intentionally stores no email; possession
  // of this expiring capability is the authorization to restore the draft.
  // It is reusable until expiry so mail scanners and a customer's first device
  // do not prevent recovery from another device.
  const order = await getRecoverableOrder(cartSaveToken.order_id);
  return order ? completeRecovery(req, order) : redirectToStatus(req, "expired");
}
