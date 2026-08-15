export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { isSaveableCart, type SaveableCartOrder } from "@/lib/cart-save";
import { sendEmail, isTransactionalEmailConfigured } from "@/lib/email";
import { buildSavedCartEmail } from "@/lib/email/savedCartEmail";
import {
  CART_SAVE_TOKEN_TTL_DAYS,
  createOrderResumeToken,
  getCartSaveExpiry,
  hashOrderResumeToken,
  isLikelyEmail,
  normalizeRecoveryEmail,
} from "@/lib/order-recovery";
import {
  canAccessOrder,
  getOrderAccess,
  hasOrderAccessContext,
} from "@/lib/order-access";
import {
  enforceRateLimit,
  rateLimitErrorResponse,
} from "@/lib/security/rateLimit";
import { supabaseServer } from "@/lib/supabase-server";

type RequestBody = {
  cartId?: unknown;
  email?: unknown;
};

function getSiteUrl(req: Request): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    new URL(req.url).origin
  ).replace(/\/$/, "");
}

function isCartSaveConfigured(): boolean {
  return Boolean(
    isTransactionalEmailConfigured() &&
      process.env.ORDER_RESUME_TOKEN_SECRET?.trim() &&
      process.env.RATE_LIMIT_KEY_SECRET?.trim(),
  );
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as RequestBody;
  const cartId = typeof body.cartId === "string" ? body.cartId.trim() : "";
  const email =
    typeof body.email === "string" ? normalizeRecoveryEmail(body.email) : "";

  if (!email || !isLikelyEmail(email)) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 },
    );
  }

  if (!cartId) {
    return NextResponse.json({ error: "Cart is unavailable." }, { status: 400 });
  }

  if (!isCartSaveConfigured()) {
    return NextResponse.json(
      { error: "Cart saving is temporarily unavailable." },
      { status: 503 },
    );
  }

  const access = await getOrderAccess(req);
  if (!hasOrderAccessContext(access)) {
    return NextResponse.json({ error: "Cart access expired." }, { status: 401 });
  }

  const emailLimit = await enforceRateLimit(req, {
    scope: "save-cart-email",
    identity: email,
    limit: 3,
    windowSeconds: 60 * 60,
  });
  if (!emailLimit.allowed) return rateLimitErrorResponse(emailLimit);

  const cartLimit = await enforceRateLimit(req, {
    scope: "save-cart-order",
    identity: cartId,
    limit: 5,
    windowSeconds: 60 * 60,
  });
  if (!cartLimit.allowed) return rateLimitErrorResponse(cartLimit);

  const { data: order, error: orderError } = await supabaseServer
    .from("orders")
    .select(
      "id, user_id, status, rx, rx_upload_path, rx_source, verification_status, payment_intent_id, shipping_email, shipping_first_name, shipping_last_name, shipping_address1, shipping_city, shipping_state, shipping_zip, sku, total_amount_cents",
    )
    .eq("id", cartId)
    .eq("status", "draft")
    .is("payment_intent_id", null)
    .maybeSingle<SaveableCartOrder>();

  if (orderError) {
    return NextResponse.json(
      { error: "Cart saving is temporarily unavailable." },
      { status: 500 },
    );
  }

  if (!order || !canAccessOrder(access, order) || !isSaveableCart(order)) {
    return NextResponse.json({ error: "Cart is unavailable." }, { status: 404 });
  }

  const now = new Date().toISOString();
  const { error: cleanupError } = await supabaseServer
    .from("cart_save_tokens")
    .delete()
    .lt("expires_at", now);
  if (cleanupError) {
    return NextResponse.json(
      { error: "Cart saving is temporarily unavailable." },
      { status: 503 },
    );
  }

  const token = createOrderResumeToken();
  const tokenHash = hashOrderResumeToken(token);
  const expiresAt = getCartSaveExpiry();
  const { error: insertError } = await supabaseServer
    .from("cart_save_tokens")
    .insert({ order_id: order.id, token_hash: tokenHash, expires_at: expiresAt });

  if (insertError) {
    return NextResponse.json(
      { error: "Cart saving is temporarily unavailable." },
      { status: 500 },
    );
  }

  const resumeUrl = `${getSiteUrl(req)}/resume-order/accept?token=${encodeURIComponent(token)}`;
  const emailDraft = buildSavedCartEmail({
    resumeUrl,
    expiresDays: CART_SAVE_TOKEN_TTL_DAYS,
  });

  try {
    await sendEmail({
      to: email,
      subject: emailDraft.subject,
      html: emailDraft.html,
      text: emailDraft.text,
      tracking: { orderId: order.id, emailType: "cart_save" },
      idempotencyKey: `cart-save:${tokenHash}`,
    });
  } catch {
    await supabaseServer
      .from("cart_save_tokens")
      .delete()
      .eq("token_hash", tokenHash);

    return NextResponse.json(
      { error: "Unable to send a save link right now." },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true });
}
