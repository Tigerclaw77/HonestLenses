export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import { buildOrderResumeEmail } from "@/lib/email/orderResumeEmail";
import {
  createOrderResumeToken,
  getOrderResumeExpiry,
  getResumeDestination,
  hashOrderResumeToken,
  isLikelyEmail,
  normalizeRecoveryEmail,
  ORDER_RESUME_TOKEN_TTL_MINUTES,
  type RecoverableOrder,
} from "@/lib/order-recovery";
import { supabaseServer } from "@/lib/supabase-server";

type RequestBody = {
  email?: unknown;
};

function getSiteUrl(req: Request): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    new URL(req.url).origin
  ).replace(/\/$/, "");
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as RequestBody;
  const email =
    typeof body.email === "string" ? normalizeRecoveryEmail(body.email) : "";

  if (!email || !isLikelyEmail(email)) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 },
    );
  }

  const { data: orders, error } = await supabaseServer
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
      total_amount_cents,
      updated_at
    `,
    )
    .eq("shipping_email", email)
    .eq("status", "draft")
    .order("updated_at", { ascending: false })
    .limit(10);

  if (error) {
    return NextResponse.json(
      { error: "Order recovery is temporarily unavailable." },
      { status: 500 },
    );
  }

  const order =
    (orders as RecoverableOrder[] | null | undefined)?.find((candidate) =>
      Boolean(getResumeDestination(candidate)),
    ) ?? null;

  if (!order) {
    return NextResponse.json({ ok: true, found: false });
  }

  const token = createOrderResumeToken();
  const tokenHash = hashOrderResumeToken(token);
  const expiresAt = getOrderResumeExpiry();

  const { error: insertError } = await supabaseServer
    .from("order_resume_tokens")
    .insert({
      order_id: order.id,
      email,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });

  if (insertError) {
    return NextResponse.json(
      { error: "Order recovery is temporarily unavailable." },
      { status: 500 },
    );
  }

  const resumeUrl = `${getSiteUrl(req)}/resume-order/accept?token=${encodeURIComponent(
    token,
  )}`;
  const emailDraft = buildOrderResumeEmail({
    resumeUrl,
    expiresMinutes: ORDER_RESUME_TOKEN_TTL_MINUTES,
  });

  try {
    await sendEmail({
      to: email,
      subject: emailDraft.subject,
      html: emailDraft.html,
      text: emailDraft.text,
    });
  } catch {
    await supabaseServer
      .from("order_resume_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("token_hash", tokenHash)
      .is("used_at", null);

    return NextResponse.json(
      { error: "Unable to send a resume link right now." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, found: true });
}
