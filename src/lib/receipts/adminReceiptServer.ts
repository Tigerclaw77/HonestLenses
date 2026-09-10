import { supabaseServer } from "@/lib/supabase-server";
import { getAdminStripe } from "@/lib/payments/adminPaymentReconciliation";
import { sendEmail, EmailSendError } from "@/lib/email";
import { buildAdminReceiptEmail, reconcileAdminReceipt, type AdminReceiptType } from "./adminReceipt";
import type { ReceiptSnapshot } from "./core";

export const adminReceiptDependencies = {
  db: supabaseServer,
  stripe: getAdminStripe,
  send: sendEmail,
};

export async function sendAdminReceipt(orderId: string, type: AdminReceiptType, requestId: string,
  actor: string, deps = adminReceiptDependencies) {
  const { data: order, error } = await deps.db.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (error || !order) throw new Error("Order details unavailable.");
  const stripe = deps.stripe();
  if (!stripe || !order.payment_intent_id) throw new Error("Captured payment details unavailable.");
  const [intent, stored] = await Promise.all([
    stripe.paymentIntents.retrieve(order.payment_intent_id, { expand: ["latest_charge"] }),
    deps.db.from("order_receipt_snapshots").select("snapshot").eq("order_id", orderId).maybeSingle(),
  ]);
  if (stored.error) throw new Error("Receipt history unavailable.");
  const receipt = reconcileAdminReceipt(order, intent, stored.data?.snapshot as ReceiptSnapshot | null);
  const message = buildAdminReceiptEmail(type, order, receipt);
  const claim = await deps.db.rpc("claim_admin_receipt_send", {
    p_order_id: orderId, p_request_id: requestId, p_receipt_type: type, p_actor: actor,
  });
  if (claim.error) throw new Error("Receipt send protection unavailable. No email sent.");
  if (!claim.data?.claimed) return { ok: false, error: claim.data?.reason ?? "Receipt send already in progress." };

  const audit = async (event: string, extra: Record<string, unknown>) => {
    try {
    const result = await deps.db.from("order_events").insert({ order_id: orderId,
      event_type: event, actor, message: `Admin ${type} receipt: ${event.replace("admin_receipt_", "")}.`,
      after: { request_id: requestId, receipt_type: type, ...extra } });
    return !result.error;
    } catch { return false; }
  };
  let result: Awaited<ReturnType<typeof sendEmail>>;
  try {
    result = await deps.send({ to: order.shipping_email.trim(), ...message,
      tracking: { orderId, emailType: `admin_${type}_receipt`, updateOrderSummary: false },
      idempotencyKey: `admin-receipt:${orderId}:${type}:${requestId}` });
    if (!result.data?.id) throw new Error("Provider acceptance unconfirmed");
  } catch (error) {
    const rejected = error instanceof EmailSendError && error.definitivelyRejected;
    const logged = await audit(rejected ? "admin_receipt_failed" : "admin_receipt_unknown", {});
    return { ok: false, error: rejected && logged
      ? "Email provider rejected the send. No receipt sent; retry after 60 seconds."
      : "Delivery outcome needs review. Check Resend before retrying; duplicate sends are blocked." };
  }
  const sentAt = new Date().toISOString();
  const logged = await audit("admin_receipt_sent", { sent_at: sentAt, email_id: result.data!.id,
    amount_paid_cents: receipt.amountPaidCents, currency: receipt.currency });
  return { ok: true, sentAt, warning: logged ? undefined :
    "Email accepted by Resend, but completion audit failed. The request is recorded; further sends are blocked pending review." };
}
