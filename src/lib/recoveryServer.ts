import Stripe from "stripe";
import { supabaseServer } from "./supabase-server";
import { createOrderResumeToken, hashOrderResumeToken, normalizeRecoveryEmail } from "./order-recovery";
import { buildAbandonedCheckoutRecoveryEmail } from "./email/recoveryEmail";
import { recoveryTouchDue, verifiedResumeDestination, type RecoveryOrder } from "./recovery";

export const RECOVERY_ORDER_FIELDS = "id,status,archived,archived_at,fulfillment_status,confirmation_email_sent_at,rx,rx_upload_path,rx_source,verification_status,payment_intent_id,shipping_email,shipping_first_name,shipping_last_name,shipping_address1,shipping_city,shipping_state,shipping_zip,sku,total_amount_cents,created_at,updated_at,email_delivery_status";

export async function getVerifiedResumeDestination(order: RecoveryOrder) {
  return verifiedResumeDestination(order, id => new Stripe(process.env.STRIPE_SECRET_KEY!).paymentIntents.retrieve(id));
}

/** Founder preview only. Unique (order_id,touch_hours) survives concurrency/retries. */
export async function prepareRecoveryDraft(orderId: string) {
  const { data: order, error } = await supabaseServer.from("orders").select(RECOVERY_ORDER_FIELDS).eq("id", orderId).maybeSingle<RecoveryOrder>();
  if (error) throw new Error("Recovery order lookup failed", { cause: error });
  const touch = order && recoveryTouchDue(order);
  if (!order || !touch || !await getVerifiedResumeDestination(order)) return { eligible: false, sendingEnabled: false };
  const token = createOrderResumeToken();
  const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const { error: insertError } = await supabaseServer.from("recovery_touch_drafts").insert({
    order_id: order.id, touch_hours: touch,
    email: normalizeRecoveryEmail(order.shipping_email!),
    token_hash: hashOrderResumeToken(token), expires_at: expiresAt,
    activity_at: order.updated_at ?? order.created_at,
  });
  if (insertError?.code === "23505") return { eligible: true, duplicate: true, sendingEnabled: false };
  if (insertError) throw new Error("Recovery draft ledger unavailable; required recovery migration must be applied", { cause: insertError });
  const draft = buildAbandonedCheckoutRecoveryEmail({
    customerName: order.shipping_first_name, customerEmail: order.shipping_email, orderId: order.id,
    resumeUrl: `https://honestlenses.com/resume-order/accept?token=${encodeURIComponent(token)}`,
  });
  return { eligible: true, duplicate: false, sendingEnabled: false, touchHours: touch, expiresAt, draft };
}
