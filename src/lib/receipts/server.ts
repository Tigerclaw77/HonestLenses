import Stripe from "stripe";
import { supabaseServer } from "@/lib/supabase-server";
import { sendFounderOperationalAlert } from "@/lib/founderAlerts";
import {
  buildReceiptSnapshot,
  createCustomerOrderNumber,
  createRandomReceiptToken,
  createStableReceiptToken,
  getReceiptExpiry,
  hashReceiptToken,
  isReceiptTokenActive,
  receiptSnapshotContainsProhibitedData,
  receiptTokenHashesMatch,
  RECEIPT_CONFIRMATION_TOKEN_TTL_DAYS,
  RECEIPT_ORDER_STATUS_TOKEN_TTL_MINUTES,
  RECEIPT_RETRIEVAL_TOKEN_TTL_MINUTES,
  type ReceiptSnapshot,
  type ReceiptTokenPurpose,
} from "./core";

type TokenIssue = { token: string; tokenHash: string; expiresAt: string };

function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(key);
}

export function getReceiptUrl(token: string, siteUrl?: string): string {
  const base = (
    siteUrl ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    "https://www.honestlenses.com"
  ).replace(/\/$/, "");
  return `${base}/receipt/${encodeURIComponent(token)}`;
}

export async function ensureCustomerOrderNumber(orderId: string): Promise<string> {
  const { data: existing, error } = await supabaseServer
    .from("orders")
    .select("customer_order_number")
    .eq("id", orderId)
    .maybeSingle();
  if (error || !existing) throw new Error("Order number lookup failed");
  if (existing.customer_order_number) return existing.customer_order_number;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const candidate = createCustomerOrderNumber();
    const { data, error: updateError } = await supabaseServer
      .from("orders")
      .update({ customer_order_number: candidate })
      .eq("id", orderId)
      .is("customer_order_number", null)
      .select("customer_order_number")
      .maybeSingle();
    if (data?.customer_order_number) return data.customer_order_number;
    if (updateError?.code !== "23505") break;
  }

  const { data: raced } = await supabaseServer
    .from("orders")
    .select("customer_order_number")
    .eq("id", orderId)
    .maybeSingle();
  if (raced?.customer_order_number) return raced.customer_order_number;
  throw new Error("Unable to assign a customer order number");
}

async function issueStableToken(
  orderId: string,
  purpose: "confirmation" | "order_status",
  ttlMinutes: number,
): Promise<TokenIssue> {
  const now = Date.now();
  const { data: existing } = await supabaseServer
    .from("order_receipt_access_tokens")
    .select("token_hash, expires_at, revoked_at")
    .eq("order_id", orderId)
    .eq("purpose", purpose)
    .is("revoked_at", null)
    .gt("expires_at", new Date(now).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing && isReceiptTokenActive(existing.expires_at, existing.revoked_at, now)) {
    const token = createStableReceiptToken(orderId, purpose, existing.expires_at);
    const tokenHash = hashReceiptToken(token);
    if (receiptTokenHashesMatch(tokenHash, existing.token_hash)) {
      return { token, tokenHash, expiresAt: existing.expires_at };
    }
  }

  const expiresAt = getReceiptExpiry(ttlMinutes, now);
  const token = createStableReceiptToken(orderId, purpose, expiresAt);
  const tokenHash = hashReceiptToken(token);
  const { error } = await supabaseServer.from("order_receipt_access_tokens").insert({
    order_id: orderId,
    token_hash: tokenHash,
    purpose,
    expires_at: expiresAt,
  });
  if (error && error.code !== "23505") throw new Error("Receipt token issuance failed");
  return { token, tokenHash, expiresAt };
}

export async function issueReceiptAccessToken(
  orderId: string,
  purpose: ReceiptTokenPurpose,
): Promise<TokenIssue> {
  if (purpose === "confirmation") {
    return issueStableToken(
      orderId,
      purpose,
      RECEIPT_CONFIRMATION_TOKEN_TTL_DAYS * 24 * 60,
    );
  }
  if (purpose === "order_status") {
    return issueStableToken(orderId, purpose, RECEIPT_ORDER_STATUS_TOKEN_TTL_MINUTES);
  }

  const token = createRandomReceiptToken();
  const tokenHash = hashReceiptToken(token);
  const expiresAt = getReceiptExpiry(RECEIPT_RETRIEVAL_TOKEN_TTL_MINUTES);
  const { error } = await supabaseServer.from("order_receipt_access_tokens").insert({
    order_id: orderId,
    token_hash: tokenHash,
    purpose,
    expires_at: expiresAt,
    delivery_status: "pending",
  });
  if (error) throw new Error("Receipt token issuance failed");
  return { token, tokenHash, expiresAt };
}

function paymentFacts(intent: Stripe.PaymentIntent, capturedAt?: string) {
  const charge =
    typeof intent.latest_charge === "object" && intent.latest_charge
      ? intent.latest_charge
      : null;
  const card = charge?.payment_method_details?.card;
  return {
    amountReceivedCents: intent.amount_received,
    currency: intent.currency,
    capturedAt:
      capturedAt ||
      (charge?.created ? new Date(charge.created * 1000).toISOString() : new Date().toISOString()),
    cardBrand: card?.brand ?? null,
    cardLast4: card?.last4 ?? null,
  };
}

export async function ensureReceiptSnapshot(
  orderId: string,
  paymentIntentId: string,
  source: "capture" | "stripe_webhook" | "historical_reconstruction",
  capturedAt?: string,
): Promise<ReceiptSnapshot> {
  const { data: existing } = await supabaseServer
    .from("order_receipt_snapshots")
    .select("snapshot")
    .eq("order_id", orderId)
    .maybeSingle();
  if (existing?.snapshot) return existing.snapshot as ReceiptSnapshot;

  const customerOrderNumber = await ensureCustomerOrderNumber(orderId);
  const [{ data: order, error }, intent] = await Promise.all([
    supabaseServer.from("orders").select("*").eq("id", orderId).maybeSingle(),
    stripeClient().paymentIntents.retrieve(paymentIntentId, {
      expand: ["latest_charge"],
    }),
  ]);
  if (error || !order) throw new Error("Receipt order facts are unavailable");
  if (intent.status !== "succeeded" || intent.amount_received <= 0) {
    throw new Error("Receipt requires a successfully captured payment");
  }

  const snapshot = buildReceiptSnapshot(
    { ...order, customer_order_number: customerOrderNumber },
    paymentFacts(intent, capturedAt),
  );
  if (receiptSnapshotContainsProhibitedData(snapshot)) {
    throw new Error("Receipt snapshot failed data-minimization checks");
  }

  const { error: insertError } = await supabaseServer
    .from("order_receipt_snapshots")
    .insert({
      order_id: orderId,
      customer_order_number: customerOrderNumber,
      snapshot_version: 1,
      snapshot,
      captured_amount_cents: snapshot.amountPaidCents,
      currency: snapshot.currency,
      captured_at: snapshot.paymentDate,
      source,
    });
  if (insertError && insertError.code !== "23505") {
    throw new Error("Receipt snapshot persistence failed");
  }

  const { data: persisted, error: persistedError } = await supabaseServer
    .from("order_receipt_snapshots")
    .select("snapshot")
    .eq("order_id", orderId)
    .single();
  if (persistedError || !persisted?.snapshot) {
    throw new Error("Receipt snapshot verification failed");
  }
  return persisted.snapshot as ReceiptSnapshot;
}

export async function ensureReceiptSnapshotWithoutAffectingPayment(
  orderId: string,
  paymentIntentId: string,
  source: "capture" | "stripe_webhook" | "historical_reconstruction",
  capturedAt?: string,
): Promise<boolean> {
  try {
    await ensureReceiptSnapshot(orderId, paymentIntentId, source, capturedAt);
    return true;
  } catch (error) {
    console.error("Receipt snapshot creation failed", {
      orderId,
      code: error instanceof Error ? error.name : "UNKNOWN",
    });
    try {
      await sendFounderOperationalAlert({
        orderId,
        type: "receipt_snapshot_failed",
        headline: "Paid receipt snapshot needs attention",
        detail:
          "Payment remains captured, but trustworthy receipt facts could not be reconciled. Review the order without changing the payment.",
      });
    } catch {
      console.error("Receipt snapshot founder alert failed", { orderId });
    }
    return false;
  }
}

export async function getReceiptByToken(token: string): Promise<{
  snapshot: ReceiptSnapshot | null;
  orderId: string;
  availability: "ready" | "pending_payment" | "unavailable";
} | null> {
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) return null;
  const tokenHash = hashReceiptToken(token);
  const now = new Date().toISOString();
  const { data: access, error } = await supabaseServer
    .from("order_receipt_access_tokens")
    .select("id, order_id, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .gt("expires_at", now)
    .maybeSingle();
  if (error || !access) return null;

  await supabaseServer
    .from("order_receipt_access_tokens")
    .update({ last_accessed_at: now })
    .eq("id", access.id)
    .is("revoked_at", null);

  const [{ data }, { data: order }] = await Promise.all([
    supabaseServer
      .from("order_receipt_snapshots")
      .select("snapshot")
      .eq("order_id", access.order_id)
      .maybeSingle(),
    supabaseServer.from("orders").select("status").eq("id", access.order_id).maybeSingle(),
  ]);
  const snapshot = (data?.snapshot as ReceiptSnapshot | undefined) ?? null;
  const paid = ["captured", "paid", "shipped", "completed"].includes(
    order?.status?.trim().toLowerCase() ?? "",
  );
  return {
    orderId: access.order_id,
    snapshot,
    availability: snapshot ? "ready" : paid ? "unavailable" : "pending_payment",
  };
}

export async function markReceiptTokenDelivery(
  tokenHash: string,
  status: "sent" | "failed",
  errorCode?: string,
): Promise<void> {
  await supabaseServer
    .from("order_receipt_access_tokens")
    .update({
      delivery_status: status,
      delivery_attempted_at: new Date().toISOString(),
      delivery_error_code: errorCode?.slice(0, 80) ?? null,
    })
    .eq("token_hash", tokenHash);
}
