import { sendEmail, EmailSendError } from "@/lib/email";
import Stripe from "stripe";
import { commercialEmailHash } from "@/lib/orderOperations";
import { isExplicitDraftOrTest } from "@/lib/orders/operationalQueue";
import { captureServerEvent } from "@/lib/posthog/server";
import { POSTHOG_EVENTS } from "@/lib/posthog/events";
import { supabaseServer as db } from "@/lib/supabase-server";
import { ensureReorderEntry } from "./entry";
import { chooseRecall, documentedExpiration, nextEligibleAt, suppressionReason,
  type RecallKind, type SuppressionReason } from "./recallPolicy";
import { buildReorderReminder } from "./reminders";
import { hasConfirmedManualInvoicePurchase } from "./invoiceSuppression";

type Preference = {
  order_id: string; email_hash: string; next_reminder_at: string | null;
  next_expiration_at: string | null; send_count: number; stopped_at: string | null;
};
type Activity = { recent_purchase: boolean; pending_reorder: boolean;
  newer_order: boolean; bounced: boolean };

async function recordEvent(orderId: string, eventType: string, key: string, details: object = {}) {
  const { error } = await db.from("reorder_reminder_events").upsert({
    order_id: orderId, event_type: eventType, event_key: key, details,
  }, { onConflict: "event_key", ignoreDuplicates: true });
  if (error) throw error;
}

async function isVerifiedExpiration(order: Record<string, unknown>, expiration: string | null) {
  if (!expiration) return false;
  const evidence = await db.from("order_events").select("id")
    .eq("order_id", order.id).in("event_type", ["admin_prescription_accepted",
      "admin_verification_override", "verification_verified", "verification_passive_auto",
      "verification_passive_already_captured", "verification_uploaded_auto"])
    .limit(1).maybeSingle();
  if (evidence.error) throw evidence.error;
  if (!evidence.data) return false;
  const withdrawn = await db.from("order_events").select("id")
    .eq("order_id", order.id).in("event_type", ["verification_rejected",
      "verification_denied", "verification_revoked", "prescription_rejected"])
    .gte("created_at", order.verification_completed_at as string).limit(1).maybeSingle();
  if (withdrawn.error) throw withdrawn.error;
  return !withdrawn.data;
}

async function sourcePayment(paymentIntentId: string | null): Promise<{
  valid: boolean; customerId: string | null; stripe: Stripe | null;
}> {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key || !paymentIntentId) return { valid: false, customerId: null, stripe: null };
  const stripe = new Stripe(key);
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId,
    { expand: ["latest_charge"] });
  const charge = intent.latest_charge;
  return { valid: intent.status === "succeeded" && intent.amount_received > 0 &&
    Boolean(charge && typeof charge !== "string" && charge.captured &&
      charge.amount_refunded === 0 && !charge.disputed),
    customerId: typeof intent.customer === "string" ? intent.customer : intent.customer?.id ?? null,
    stripe };
}

export async function evaluateRecall(preference: Preference, now = Date.now(), dueBy = now): Promise<{
  order: { id: string; shipping_email: string; shipping_first_name: string | null } | null;
  kind: RecallKind | null; scheduledFor: string | null;
  reason: SuppressionReason | "not_due" | "historical" | "recipient_mismatch" | null;
  nextEligible: string | null;
}> {
  const loaded = await db.from("orders").select(`id,status,created_at,updated_at,
    shipping_email,shipping_first_name,shipping_last_name,patient_name,patient_full_name,
    patient_first_name,patient_last_name,patient_dob,rx_patient_name,rx_dob,fulfillment_status,admin_notes,
    rx,rx_expiration_date,verification_status,verification_passed,verification_completed_at,
    payment_intent_id`)
    .eq("id", preference.order_id).maybeSingle();
  if (loaded.error) throw loaded.error;
  const order = loaded.data;
  if (!order?.shipping_email || commercialEmailHash(order.shipping_email) !== preference.email_hash) {
    return { order: null, kind: null, scheduledFor: null,
      reason: "recipient_mismatch", nextEligible: null };
  }
  const safeOrder = { id: order.id, shipping_email: order.shipping_email,
    shipping_first_name: order.shipping_first_name };
  const expiration = documentedExpiration(order, now);
  const verifiedExpiration = await isVerifiedExpiration(order, expiration);
  const selected = chooseRecall({
    replenishmentAt: preference.next_reminder_at,
    expirationAt: verifiedExpiration ? preference.next_expiration_at : null,
    expirationDate: verifiedExpiration ? expiration : null, now, dueBy,
  });
  if (!selected) return { order: safeOrder, kind: null, scheduledFor: null,
    reason: preference.next_expiration_at && Date.parse(preference.next_expiration_at) <= now &&
      !verifiedExpiration ? "unreliable_prescription" : "not_due", nextEligible: null };
  const suppressed = await db.from("commercial_email_suppressions").select("email_hash")
    .eq("email_hash", preference.email_hash).maybeSingle();
  if (suppressed.error) throw suppressed.error;
  const activity = await db.rpc("reorder_recall_activity", { p_order_id: order.id });
  if (activity.error) throw activity.error;
  const facts = (Array.isArray(activity.data) ? activity.data[0] : activity.data) as Activity | null;
  if (!facts) throw new Error("Recipient activity unavailable");
  const claim = await db.from("reorder_recall_recipient_claims")
    .select("claimed_at,status").eq("email_hash", preference.email_hash).maybeSingle();
  if (claim.error) throw claim.error;
  const policyInput = { optedOut: Boolean(suppressed.data), bounced: facts.bounced,
    recentPurchase: facts.recent_purchase, pendingReorder: facts.pending_reorder,
    newerOrder: facts.newer_order, captured: ["captured", "fulfilled"].includes(order.status) &&
      order.fulfillment_status !== "cancelled",
    synthetic: isExplicitDraftOrTest(order),
    lastClaimedAt: claim.data?.claimed_at, claimStatus: claim.data?.status, now };
  const preliminary = suppressionReason({ ...policyInput, paymentValid: true });
  const payment = preliminary ? null : await sourcePayment(order.payment_intent_id);
  let reason: SuppressionReason | null = preliminary ?? suppressionReason({ ...policyInput,
    paymentValid: payment?.valid ?? false });
  if (!reason && payment?.stripe && await hasConfirmedManualInvoicePurchase(payment.stripe, {
    orderId: order.id, sourceIntentId: order.payment_intent_id,
    customerId: payment.customerId, email: order.shipping_email,
    createdAt: order.created_at,
  }, now)) reason = "manual_invoice_purchase";
  return { order: safeOrder, kind: selected.kind, scheduledFor: selected.scheduledFor,
    reason, nextEligible: claim.data?.status === "accepted"
      ? nextEligibleAt(claim.data.claimed_at) : null };
}

async function duePreferences(now: string): Promise<Preference[]> {
  const { data, error } = await db.from("reorder_reminder_preferences")
    .select("order_id,email_hash,next_reminder_at,next_expiration_at,send_count,stopped_at")
    .is("stopped_at", null)
    .or(`next_reminder_at.lte.${now},next_expiration_at.lte.${now}`)
    .order("updated_at", { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []) as Preference[];
}

/** Read-only preview; no claims, preference changes, email, or orders are created. */
export async function previewReorderRecall(now = Date.now()) {
  const { data: control, error } = await db.from("order_operations_control")
    .select("reorder_reminders_enabled,reorder_recall_live_from")
    .eq("id", true).single();
  if (error || !control) throw new Error("Reminder control unavailable");
  const due = await duePreferences(new Date(now + 30 * 86_400_000).toISOString());
  const seen = new Set<string>();
  const reasons: Record<string, number> = {};
  let eligible = 0;
  const upcoming: { orderId: string; kind: RecallKind; scheduledFor: string }[] = [];
  for (const preference of due) {
    if (seen.has(preference.email_hash)) {
      reasons.shared_recipient = (reasons.shared_recipient ?? 0) + 1;
      continue;
    }
    seen.add(preference.email_hash);
    const result = await evaluateRecall(preference, now, now + 30 * 86_400_000);
    const reason = result.reason === "not_due" ? "outside_window" : result.reason;
    if (reason) reasons[reason] = (reasons[reason] ?? 0) + 1;
    else if (result.kind && result.scheduledFor) {
      eligible++;
      upcoming.push({ orderId: preference.order_id, kind: result.kind,
        scheduledFor: result.scheduledFor });
    }
  }
  const metrics = await db.rpc("reorder_recall_metrics");
  if (metrics.error) throw metrics.error;
  const totals = Array.isArray(metrics.data) ? metrics.data[0] : metrics.data;
  if (!totals) throw new Error("Recall metrics unavailable");
  return { enabled: control.reorder_reminders_enabled, eligible,
    scheduled: Number(totals.scheduled),
    suppressed: Object.values(reasons).reduce((a, b) => a + b, 0), reasons,
    sent: Number(totals.sent), failures: Number(totals.delivery_failures),
    conversions: Number(totals.conversions),
    upcoming: upcoming.slice(0, 20), estimatedVolume: eligible };
}

/** The sole automated recall sender. A database recipient claim enforces the cooldown. */
export async function runReorderReminders(): Promise<{ enabled: boolean; examined: number; accepted: number }> {
  const { data: control, error: controlError } = await db.from("order_operations_control")
    .select("reorder_reminders_enabled,reorder_recall_live_from,reorder_recall_compliance_approved_at,postal_address")
    .eq("id", true).single();
  if (controlError || !control) throw new Error("Reminder control unavailable");
  if (!control.reorder_reminders_enabled) return { enabled: false, examined: 0, accepted: 0 };
  if (!control.reorder_recall_live_from || !control.reorder_recall_compliance_approved_at || !control.postal_address ||
      control.postal_address.trim().length < 10) throw new Error("Recall activation is incomplete");
  const now = new Date().toISOString();
  const due = await duePreferences(now);
  const seen = new Set<string>();
  let accepted = 0;
  for (const preference of due) {
    if (seen.has(preference.email_hash)) {
      await recordEvent(preference.order_id, "suppressed",
        `shared-recipient:${preference.order_id}:${preference.next_reminder_at ?? preference.next_expiration_at}`,
        { reason: "shared_recipient" });
      continue;
    }
    seen.add(preference.email_hash);
    const result = await evaluateRecall(preference);
    if (result.reason === "not_due") continue;
    if (result.reason === "unreliable_prescription") {
      const cleared = await db.from("reorder_reminder_preferences")
        .update({ next_expiration_at: null }).eq("order_id", preference.order_id);
      if (cleared.error) throw cleared.error;
    }
    if (result.reason) {
      await recordEvent(preference.order_id, "suppressed",
        `suppressed:${preference.order_id}:${result.scheduledFor ?? preference.next_expiration_at}:${result.reason}`,
        { reason: result.reason, next_eligible_at: result.nextEligible });
      if (result.reason === "cooldown" && result.nextEligible) {
        const updated = await db.from("reorder_reminder_preferences")
          .update({ next_reminder_at: preference.next_reminder_at
              ? new Date(Math.max(Date.parse(preference.next_reminder_at), Date.parse(result.nextEligible))).toISOString() : null,
            next_expiration_at: preference.next_expiration_at
              ? new Date(Math.max(Date.parse(preference.next_expiration_at), Date.parse(result.nextEligible))).toISOString() : null })
          .eq("order_id", preference.order_id);
        if (updated.error) throw updated.error;
      }
      continue;
    }
    if (!result.order || !result.kind || !result.scheduledFor) continue;
    if (Date.parse(result.scheduledFor) < Date.parse(control.reorder_recall_live_from)) {
      await recordEvent(preference.order_id, "suppressed",
        `historical:${preference.order_id}:${result.scheduledFor}`, { reason: "historical_activation" });
      const cleared = await db.from("reorder_reminder_preferences")
        .update({ next_reminder_at: preference.next_reminder_at &&
            Date.parse(preference.next_reminder_at) >= Date.parse(control.reorder_recall_live_from)
            ? preference.next_reminder_at : null,
          next_expiration_at: preference.next_expiration_at &&
            Date.parse(preference.next_expiration_at) >= Date.parse(control.reorder_recall_live_from)
            ? preference.next_expiration_at : null }).eq("order_id", preference.order_id);
      if (cleared.error) throw cleared.error;
      continue;
    }
    const key = `reorder-recall:${preference.order_id}:${result.scheduledFor}`;
    const claim = await db.rpc("claim_reorder_recall_recipient", {
      p_email_hash: preference.email_hash, p_claim_key: key, p_order_id: preference.order_id });
    if (claim.error) throw claim.error;
    if (!claim.data) continue;
    const attempt = await db.from("reorder_reminder_attempts")
      .insert({ order_id: preference.order_id, scheduled_for: result.scheduledFor });
    if (attempt.error) throw attempt.error;
    await recordEvent(preference.order_id, "queued", `queued:${key}`, { kind: result.kind });
    try {
      const reorderUrl = await ensureReorderEntry(preference.order_id);
      const message = buildReorderReminder({ orderId: preference.order_id,
        firstName: result.order.shipping_first_name || "there", reorderUrl,
        postalAddress: control.postal_address });
      const sent = await sendEmail({ to: result.order.shipping_email, ...message,
        tracking: { orderId: preference.order_id, emailType: "reorder_reminder", updateOrderSummary: false },
        idempotencyKey: key, redactProviderErrorLog: true });
      if (!sent.data?.id) throw new Error("Provider acceptance unconfirmed");
      const at = new Date().toISOString();
      const recorded = await db.from("reorder_reminder_attempts")
        .update({ status: "accepted", provider_id: sent.data.id, completed_at: at })
        .eq("order_id", preference.order_id).eq("scheduled_for", result.scheduledFor);
      if (recorded.error) throw recorded.error;
      const recipient = await db.from("reorder_recall_recipient_claims")
        .update({ status: "accepted" }).eq("email_hash", preference.email_hash).eq("claim_key", key);
      if (recipient.error) throw recipient.error;
      const updated = await db.from("reorder_reminder_preferences")
        .update({ next_reminder_at: result.kind !== "expiration" ? null : preference.next_reminder_at,
          next_expiration_at: result.kind !== "replenishment" ? null : preference.next_expiration_at,
          ...(result.kind !== "replenishment" ? { expiration_sent_at: at } : {}),
          last_sent_at: at, updated_at: at, send_count: preference.send_count + 1 })
        .eq("order_id", preference.order_id);
      if (updated.error) throw updated.error;
      await recordEvent(preference.order_id, "accepted", `accepted:${key}`, { kind: result.kind });
      await captureServerEvent({ event: POSTHOG_EVENTS.REMINDER_SENT });
      accepted++;
    } catch (error) {
      const definite = error instanceof EmailSendError && error.definitivelyRejected;
      await db.from("reorder_reminder_attempts")
        .update({ status: definite ? "rejected" : "unknown", completed_at: new Date().toISOString(),
          error_code: error instanceof Error ? error.name : "UNKNOWN" })
        .eq("order_id", preference.order_id).eq("scheduled_for", result.scheduledFor).eq("status", "claimed");
      if (definite) await db.from("reorder_recall_recipient_claims").delete()
        .eq("email_hash", preference.email_hash).eq("claim_key", key).eq("status", "claimed");
      else await db.from("reorder_recall_recipient_claims")
        .update({ status: "unknown" }).eq("email_hash", preference.email_hash).eq("claim_key", key);
      // Only a definite rate-limit rejection is retried. Unknown outcomes remain
      // claimed for operator review so a possible send cannot be duplicated.
      let retryAt: string | null = null;
      if (error instanceof EmailSendError && error.statusCode === 429) {
        const attempts = await db.from("reorder_reminder_attempts")
          .select("order_id", { count: "exact", head: true })
          .eq("order_id", preference.order_id).eq("status", "rejected")
          .gte("claimed_at", new Date(Date.now() - 2 * 86_400_000).toISOString());
        if (!attempts.error && (attempts.count ?? 3) < 3) {
          retryAt = new Date(Date.now() + 2 * 3_600_000).toISOString();
        }
      }
      await db.from("reorder_reminder_preferences")
        .update({ next_reminder_at: retryAt && result.kind !== "expiration" ? retryAt : null,
          next_expiration_at: retryAt && result.kind !== "replenishment" ? retryAt : null })
        .eq("order_id", preference.order_id);
    }
  }
  return { enabled: true, examined: due.length, accepted };
}
