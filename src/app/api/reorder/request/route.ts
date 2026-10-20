export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import { hasTrustedMutationOrigin } from "@/lib/auth/authorization";
import { enforceRateLimit, rateLimitErrorResponse } from "@/lib/security/rateLimit";
import { supabaseServer } from "@/lib/supabase-server";
import { captureServerEvent } from "@/lib/posthog/server";
import { POSTHOG_EVENTS } from "@/lib/posthog/events";
import {
  createReorderAuthToken, hashReorderEmail, hashReorderToken, isReorderToken,
} from "@/lib/reorder/tokens";

const genericResponse = () => NextResponse.json({ ok: true,
  message: "If this link is available, we will email a secure checkout link to the address on file." });

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  const entryToken = body?.token;
  if (!isReorderToken(entryToken)) return genericResponse();
  const ipLimit = await enforceRateLimit(request, {
    scope: "reorder-link-request-ip", limit: 20, windowSeconds: 3600,
  });
  if (!ipLimit.allowed) return rateLimitErrorResponse(ipLimit);
  const entryHash = hashReorderToken(entryToken);
  const limit = await enforceRateLimit(request, {
    scope: "reorder-link-request", identity: entryHash, limit: 3, windowSeconds: 3600,
  });
  if (!limit.allowed) return rateLimitErrorResponse(limit);

  const { data: entry, error: entryError } = await supabaseServer
    .from("reorder_entry_links").select("order_id")
    .eq("token_hash", entryHash).is("revoked_at", null).maybeSingle();
  if (entryError) return NextResponse.json({ error: "Reorder links are unavailable." }, { status: 503 });
  if (!entry) return genericResponse();
  const { data: order, error: orderError } = await supabaseServer
    .from("orders").select("id,status,shipping_email")
    .eq("id", entry.order_id).maybeSingle();
  if (orderError) return NextResponse.json({ error: "Reorder links are unavailable." }, { status: 503 });
  if (!order || !["captured", "paid", "shipped", "completed"].includes(order.status) ||
      !order.shipping_email) return genericResponse();

  const token = createReorderAuthToken();
  const tokenHash = hashReorderToken(token);
  const { error: tokenError } = await supabaseServer.from("reorder_auth_tokens").insert({
    order_id: order.id,
    token_hash: tokenHash,
    recipient_hash: hashReorderEmail(order.shipping_email),
    expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
  });
  if (tokenError) return NextResponse.json({ error: "Reorder links are unavailable." }, { status: 503 });

  const base = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || new URL(request.url).origin).replace(/\/$/, "");
  const url = `${base}/reorder/accept?token=${encodeURIComponent(token)}`;
  try {
    await sendEmail({
      to: order.shipping_email,
      subject: "Your secure Honest Lenses reorder link",
      html: `<p>Use this secure link to review a new order based on your previous purchase.</p><p><a href="${url}">Continue reorder</a></p><p>This link expires in 15 minutes and can be used once. If you did not request it, ignore this email.</p>`,
      text: `Use this secure link to review a new order based on your previous purchase:\n${url}\n\nThis link expires in 15 minutes and can be used once. If you did not request it, ignore this email.`,
      tracking: { orderId: order.id, emailType: "reorder_auth", updateOrderSummary: false },
      idempotencyKey: `reorder-auth:${tokenHash}`,
      redactProviderErrorLog: true,
    });
  } catch {
    await supabaseServer.from("reorder_auth_tokens")
      .update({ used_at: new Date().toISOString() }).eq("token_hash", tokenHash);
    return NextResponse.json({ error: "Reorder links are temporarily unavailable." }, { status: 503 });
  }
  await captureServerEvent({ event: POSTHOG_EVENTS.REORDER_AUTH_REQUESTED,
    request, properties: { sent: true } });
  return genericResponse();
}
