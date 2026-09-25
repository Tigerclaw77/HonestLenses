export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import { buildOrderResumeEmail } from "@/lib/email/orderResumeEmail";
import {
  getOrderRecoveryEmailIdempotencyKey,
  ORDER_RECOVERY_EMAIL_COOLDOWN_SECONDS,
  ORDER_RECOVERY_EMAIL_TYPE,
  runWithOrderRecoveryEmailSendClaim,
  type OrderRecoveryEmailSendClaim,
} from "@/lib/email/orderRecoveryClaim";
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
import { getVerifiedResumeDestination, RECOVERY_ORDER_FIELDS } from "@/lib/recoveryServer";
import { supabaseServer } from "@/lib/supabase-server";
import {
  enforceRateLimit,
  rateLimitErrorResponse,
} from "@/lib/security/rateLimit";

type RequestBody = {
  email?: unknown;
};

async function claimRecoveryEmailSend(
  orderId: string,
  email: string,
): Promise<OrderRecoveryEmailSendClaim | null> {
  const { data, error } = await supabaseServer.rpc(
    "claim_order_recovery_email_send",
    {
      p_order_id: orderId,
      p_recipient_email: email,
      p_email_type: ORDER_RECOVERY_EMAIL_TYPE,
      p_cooldown_seconds: ORDER_RECOVERY_EMAIL_COOLDOWN_SECONDS,
    },
  );

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  return {
    claimId: row.claim_id,
    claimedAt: row.claimed_at,
  };
}

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

  const rateLimit = await enforceRateLimit(req, {
    scope: "order-recovery-email",
    identity: email,
    limit: 5,
    windowSeconds: 60 * 60,
  });
  if (!rateLimit.allowed) return rateLimitErrorResponse(rateLimit);

  const { data: orders, error } = await supabaseServer
    .from("orders")
    .select(RECOVERY_ORDER_FIELDS)
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

  if (!order || !await getVerifiedResumeDestination(order).catch(() => null)) {
    return NextResponse.json({ ok: true });
  }

  try {
    await runWithOrderRecoveryEmailSendClaim({
      acquireClaim: () => claimRecoveryEmailSend(order.id, email),
      send: async (claim) => {
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

        if (insertError) throw insertError;

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
            tracking: {
              orderId: order.id,
              emailType: ORDER_RECOVERY_EMAIL_TYPE,
            },
            idempotencyKey: getOrderRecoveryEmailIdempotencyKey(claim.claimId),
          });
        } catch (sendError) {
          await supabaseServer
            .from("order_resume_tokens")
            .update({ used_at: new Date().toISOString() })
            .eq("token_hash", tokenHash)
            .is("used_at", null);
          throw sendError;
        }
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Order recovery is temporarily unavailable." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
