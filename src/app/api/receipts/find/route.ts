export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import { buildReceiptAccessEmail } from "@/lib/email/receiptAccessEmail";
import { sendFounderOperationalAlert } from "@/lib/founderAlerts";
import {
  isCustomerOrderNumber,
  isHistoricalOrderUuid,
  isReceiptEmail,
  normalizeReceiptEmail,
  receiptEmailsMatch,
  RECEIPT_RETRIEVAL_TOKEN_TTL_MINUTES,
} from "@/lib/receipts/core";
import {
  ensureReceiptSnapshotWithoutAffectingPayment,
  getReceiptUrl,
  issueReceiptAccessToken,
  markReceiptTokenDelivery,
} from "@/lib/receipts/server";
import { enforceRateLimit, rateLimitErrorResponse } from "@/lib/security/rateLimit";
import { supabaseServer } from "@/lib/supabase-server";

const NEUTRAL_MESSAGE =
  "If the order details match our records, we’ll send a secure receipt link to the checkout email.";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const orderNumber =
    typeof body?.orderNumber === "string" ? body.orderNumber.trim() : "";
  const email = typeof body?.email === "string" ? normalizeReceiptEmail(body.email) : "";

  if (
    (!isCustomerOrderNumber(orderNumber) && !isHistoricalOrderUuid(orderNumber)) ||
    !isReceiptEmail(email)
  ) {
    return NextResponse.json({ error: "Enter a valid order number and email." }, { status: 400 });
  }

  const rateLimit = await enforceRateLimit(request, {
    scope: "receipt-retrieval",
    identity: `${orderNumber.toLowerCase()}\n${email}`,
    limit: 5,
    windowSeconds: 60 * 60,
  });
  if (!rateLimit.allowed) return rateLimitErrorResponse(rateLimit);

  let query = supabaseServer
    .from("orders")
    .select("id, status, shipping_email, payment_intent_id");
  query = isHistoricalOrderUuid(orderNumber)
    ? query.eq("id", orderNumber)
    : query.eq("customer_order_number", orderNumber.toUpperCase());
  const { data: order } = await query.maybeSingle();

  const paid = ["captured", "paid", "shipped", "completed"].includes(
    order?.status?.trim().toLowerCase() ?? "",
  );
  if (
    !order?.shipping_email ||
    !receiptEmailsMatch(order.shipping_email, email) ||
    !paid ||
    !order.payment_intent_id
  ) {
    return NextResponse.json({ ok: true, message: NEUTRAL_MESSAGE });
  }

  await ensureReceiptSnapshotWithoutAffectingPayment(
    order.id,
    order.payment_intent_id,
    "historical_reconstruction",
  );

  let issuedTokenHash: string | null = null;
  try {
    const access = await issueReceiptAccessToken(order.id, "retrieval");
    issuedTokenHash = access.tokenHash;
    const receiptUrl = getReceiptUrl(access.token, new URL(request.url).origin);
    const draft = buildReceiptAccessEmail({
      receiptUrl,
      expiresMinutes: RECEIPT_RETRIEVAL_TOKEN_TTL_MINUTES,
    });
    await sendEmail({
      to: order.shipping_email,
      subject: draft.subject,
      html: draft.html,
      text: draft.text,
      tracking: { orderId: order.id, emailType: "receipt_access" },
      idempotencyKey: `receipt-access:${access.tokenHash}`,
    });
    await markReceiptTokenDelivery(access.tokenHash, "sent");
  } catch (error) {
    const code = error instanceof Error ? error.name : "UNKNOWN";
    if (issuedTokenHash) {
      await markReceiptTokenDelivery(issuedTokenHash, "failed", code);
    }
    try {
      await sendFounderOperationalAlert({
        orderId: order.id,
        type: "receipt_access_email_failed",
        headline: "Receipt access email failed",
        detail: "A requested receipt link could not be delivered. No payment action was taken.",
      });
    } catch {
      console.error("Receipt access founder alert failed", { orderId: order.id });
    }
    console.error("Receipt access delivery failed", { orderId: order.id, code });
  }

  return NextResponse.json({ ok: true, message: NEUTRAL_MESSAGE });
}
