import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { sendEmail } from "@/lib/email";
import { buildAbandonedCheckoutRecoveryEmail } from "@/lib/email/recoveryEmail";
import {
  classifyAbandonedCheckout,
  getAbandonedCheckoutThresholdHours,
  getStaleCheckoutThresholdHours,
} from "@/lib/ops/abandonedCheckout";
import {
  createOrderResumeToken,
  hashOrderResumeToken,
  normalizeRecoveryEmail,
} from "@/lib/order-recovery";
import { commercialEmailHash } from "@/lib/orderOperations";
import { reconcileAdminPaymentState } from "@/lib/payments/adminPaymentReconciliation";
import { verifiedResumeDestination, type RecoveryIntent } from "@/lib/recovery";
import { supabaseServer } from "@/lib/supabase-server";
import { isManualRecoveryCandidate } from "@/lib/orders/manualRecovery";

const MANUAL_RECOVERY_ORDER_FIELDS =
  "id,user_id,status,archived,archived_at,fulfillment_status,confirmation_email_sent_at,rx,rx_upload_path,rx_source,verification_status,payment_intent_id,shipping_email,shipping_first_name,shipping_last_name,shipping_address1,shipping_city,shipping_state,shipping_zip,sku,total_amount_cents,created_at,updated_at,email_delivery_status,prescriber_name,prescriber_email,prescriber_phone";

type ManualOrder = {
  id: string;
  user_id?: string | null;
  status: string | null;
  payment_status?: string | null;
  archived?: boolean | null;
  archived_at?: string | null;
  fulfillment_status?: string | null;
  confirmation_email_sent_at?: string | null;
  rx?: unknown;
  rx_upload_path?: string | null;
  rx_source?: string | null;
  verification_status?: string | null;
  payment_intent_id?: string | null;
  shipping_email?: string | null;
  shipping_first_name?: string | null;
  shipping_last_name?: string | null;
  shipping_address1?: string | null;
  shipping_city?: string | null;
  shipping_state?: string | null;
  shipping_zip?: string | null;
  sku?: string | null;
  total_amount_cents?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  email_delivery_status?: string | null;
  prescriber_name?: string | null;
  prescriber_email?: string | null;
  prescriber_phone?: string | null;
  stripe_payment_intent_status?: string | null;
};

type ClaimResult = {
  claimed?: boolean;
  reason?: string;
  delivery_id?: string;
};

export type ManualRecoveryResult =
  | { ok: true; state: "sent" | "ignored"; at: string }
  | { ok: false; code: string; message: string };

function databaseFailure(message: string, cause: unknown): never {
  throw new Error(message, { cause });
}

async function loadOrder(orderId: string): Promise<ManualOrder | null> {
  const { data, error } = await supabaseServer
    .from("orders")
    .select(MANUAL_RECOVERY_ORDER_FIELDS)
    .eq("id", orderId)
    .maybeSingle<ManualOrder>();
  if (error) databaseFailure("Manual recovery order lookup failed", error);
  return data;
}

function classify(order: ManualOrder) {
  return classifyAbandonedCheckout(order, {
    thresholdHours: getAbandonedCheckoutThresholdHours(
      process.env.ABANDONED_CHECKOUT_THRESHOLD_HOURS,
    ),
    staleThresholdHours: getStaleCheckoutThresholdHours(
      process.env.STALE_CHECKOUT_THRESHOLD_HOURS,
    ),
  });
}

async function retrieveStripeIntent(order: ManualOrder): Promise<RecoveryIntent | null> {
  if (!order.payment_intent_id) return null;
  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret) throw new Error("Stripe reconciliation is unavailable");
  const intent = await new Stripe(secret).paymentIntents.retrieve(
    order.payment_intent_id,
  );
  await reconcileAdminPaymentState({
    order,
    stripeStatus: intent.status,
    actor: "system:manual-recovery",
    source: "admin_manual_recovery",
  });
  return {
    id: intent.id,
    status: intent.status,
    metadata: intent.metadata,
    amount_received: intent.amount_received,
    amount_capturable: intent.amount_capturable,
  };
}

async function getAuthoritativeCandidate(orderId: string): Promise<ManualOrder | null> {
  const order = await loadOrder(orderId);
  if (!order) return null;
  const intent = await retrieveStripeIntent(order);
  const authoritative = intent
    ? { ...order, stripe_payment_intent_status: intent.status }
    : order;
  const resume = await verifiedResumeDestination(
    authoritative,
    async () => intent!,
  );
  return resume && isManualRecoveryCandidate(authoritative, classify(authoritative))
    ? authoritative
    : null;
}

async function isSuppressed(email: string): Promise<boolean> {
  const { data, error } = await supabaseServer
    .from("commercial_email_suppressions")
    .select("email_hash")
    .eq("email_hash", commercialEmailHash(email))
    .maybeSingle();
  if (error) databaseFailure("Recovery suppression lookup failed", error);
  return Boolean(data);
}

async function audit(
  orderId: string,
  actor: string,
  eventType: string,
  at: string,
) {
  const { error } = await supabaseServer.from("order_events").insert({
    order_id: orderId,
    event_type: eventType,
    actor,
    message:
      eventType === "admin_recovery_email_sent"
        ? "Admin reviewed the incomplete order and sent the approved recovery email."
        : "Admin dismissed the manual recovery indication.",
    after: { recovery_review: eventType, at },
  });
  if (error) {
    console.warn("Manual recovery audit event failed", {
      orderId,
      eventType,
      error: error.message,
    });
  }
}

export async function ignoreManualRecovery(
  orderId: string,
  adminId: string,
  actor: string,
): Promise<ManualRecoveryResult> {
  const order = await getAuthoritativeCandidate(orderId);
  if (!order || !order.shipping_email) {
    return { ok: false, code: "INELIGIBLE", message: "This order is no longer eligible for recovery." };
  }
  if (await isSuppressed(order.shipping_email)) {
    return { ok: false, code: "INELIGIBLE", message: "This email address is not eligible for recovery." };
  }

  const at = new Date().toISOString();
  const deliveryId = randomUUID();
  const token = createOrderResumeToken();
  const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const { data, error } = await supabaseServer.rpc("ignore_manual_recovery", {
    p_order_id: order.id,
    p_delivery_id: deliveryId,
    p_email: normalizeRecoveryEmail(order.shipping_email),
    p_token_hash: hashOrderResumeToken(token),
    p_activity_at: order.updated_at ?? order.created_at,
    p_expires_at: expiresAt,
    p_admin_id: adminId,
  });
  if (error) databaseFailure("Unable to record recovery dismissal", error);
  const result = (data ?? {}) as ClaimResult;
  if (!result.claimed) {
    return { ok: false, code: "ALREADY_RESOLVED", message: "Recovery was already sent, ignored, or is in progress." };
  }
  await audit(order.id, actor, "admin_recovery_ignored", at);
  return { ok: true, state: "ignored", at };
}

export async function sendManualRecovery(
  orderId: string,
  adminId: string,
  actor: string,
): Promise<ManualRecoveryResult> {
  let order = await getAuthoritativeCandidate(orderId);
  if (!order || !order.shipping_email) {
    return { ok: false, code: "INELIGIBLE", message: "This order is no longer eligible for recovery." };
  }
  if (await isSuppressed(order.shipping_email)) {
    return { ok: false, code: "INELIGIBLE", message: "This email address is not eligible for recovery." };
  }

  const deliveryId = randomUUID();
  const token = createOrderResumeToken();
  const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const email = normalizeRecoveryEmail(order.shipping_email);
  const { data, error } = await supabaseServer.rpc("claim_manual_recovery_delivery", {
    p_order_id: order.id,
    p_delivery_id: deliveryId,
    p_email: email,
    p_token_hash: hashOrderResumeToken(token),
    p_activity_at: order.updated_at ?? order.created_at,
    p_expires_at: expiresAt,
    p_admin_id: adminId,
  });
  if (error) databaseFailure("Unable to claim recovery delivery", error);
  const claim = (data ?? {}) as ClaimResult;
  if (!claim.claimed || !claim.delivery_id) {
    return { ok: false, code: "ALREADY_RESOLVED", message: "Recovery was already sent, ignored, or is in progress." };
  }

  // Reconcile again after the atomic claim, immediately before transmission.
  order = await getAuthoritativeCandidate(order.id);
  if (
    !order ||
    normalizeRecoveryEmail(order.shipping_email ?? "") !== email ||
    await isSuppressed(email)
  ) {
    await supabaseServer
      .from("recovery_touch_drafts")
      .update({ state: "suppressed", last_error: "Order or recipient became ineligible after manual claim." })
      .eq("id", claim.delivery_id)
      .eq("state", "sending");
    return { ok: false, code: "INELIGIBLE", message: "The order completed or changed before the email could be sent." };
  }

  const message = buildAbandonedCheckoutRecoveryEmail({
    customerName: order.shipping_first_name,
    customerEmail: email,
    orderId: order.id,
    resumeUrl: `https://honestlenses.com/resume-order/accept?token=${encodeURIComponent(token)}`,
  });

  try {
    const sent = await sendEmail({
      to: email,
      subject: message.subject,
      text: message.text,
      html: message.html,
      idempotencyKey: `manual-order-recovery:${order.id}`,
      tracking: {
        orderId: order.id,
        emailType: "order_recovery",
        updateOrderSummary: false,
      },
    });
    if (!sent.data?.id) throw new Error("Email provider did not confirm a delivery ID");
    const at = new Date().toISOString();
    const updated = await supabaseServer
      .from("recovery_touch_drafts")
      .update({ state: "sent", sent_at: at, provider_id: sent.data.id, last_error: null })
      .eq("id", claim.delivery_id)
      .eq("state", "sending")
      .select("id")
      .maybeSingle();
    if (updated.error || !updated.data) {
      databaseFailure("Recovery was accepted by the provider but its ledger could not be finalized", updated.error);
    }
    await audit(order.id, actor, "admin_recovery_email_sent", at);
    return { ok: true, state: "sent", at };
  } catch (sendError) {
    await supabaseServer
      .from("recovery_touch_drafts")
      .update({ state: "needs_review", last_error: "Manual delivery outcome requires review; duplicate sending is blocked." })
      .eq("id", claim.delivery_id)
      .eq("state", "sending");
    throw sendError;
  }
}
