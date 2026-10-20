import type Stripe from "stripe";
import { commercialEmailHash } from "@/lib/orderOperations";
import { supabaseServer } from "@/lib/supabase-server";
import {
  REMINDER_CATEGORIES, REMINDER_PERMISSION_VERSION, REMINDER_PERMISSION_WORDING,
  REMINDER_PRIVACY_POLICY_VERSION,
} from "./permissionCopy";

export type ReminderPermissionState =
  "affirmatively_requested" | "no_recorded_preference" |
  "explicitly_declined" | "unsubscribed";

/** A Stripe metadata choice is only committed after an authorized checkout. */
export async function recordCheckoutReminderPermission(order: {
  id: string; payment_intent_id?: string | null; shipping_email?: string | null;
  status?: string | null;
}, intent: Stripe.PaymentIntent): Promise<boolean> {
  if (intent.metadata?.checkout_reminder_request !== REMINDER_PERMISSION_VERSION) return false;
  if (intent.metadata.order_id !== order.id || intent.id !== order.payment_intent_id ||
      !["requires_capture", "succeeded"].includes(intent.status) ||
      !["authorized", "captured", "completed"].includes(order.status ?? "")) {
    throw new Error("Reminder request is not linked to a completed checkout.");
  }
  const email = order.shipping_email?.trim().toLowerCase() ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Reminder request has no valid checkout email.");
  }
  const { error } = await supabaseServer.from("customer_reminder_choices").upsert({
    order_id: order.id, customer_email: email, email_hash: commercialEmailHash(email),
    decision: "requested", recorded_at: new Date().toISOString(),
    wording: REMINDER_PERMISSION_WORDING,
    wording_version: REMINDER_PERMISSION_VERSION,
    privacy_policy_version: REMINDER_PRIVACY_POLICY_VERSION,
    source: "checkout", categories: [...REMINDER_CATEGORIES],
    payment_intent_id: intent.id,
  }, { onConflict: "order_id", ignoreDuplicates: true });
  if (error) throw error;
  return true;
}

export async function recordCapturedCheckoutReminderPermission(
  orderId: string, intent: Stripe.PaymentIntent,
): Promise<boolean> {
  if (intent.metadata?.checkout_reminder_request !== REMINDER_PERMISSION_VERSION) return false;
  const { data: order, error } = await supabaseServer.from("orders")
    .select("id,payment_intent_id,shipping_email,status")
    .eq("id", orderId).eq("payment_intent_id", intent.id).maybeSingle();
  if (error || !order) throw new Error("Captured reminder order unavailable.");
  return recordCheckoutReminderPermission(order, intent);
}

/** Unsubscribe takes precedence; an unchecked checkout creates no decision row. */
export async function reminderPermissionState(
  orderId: string, email: string,
): Promise<ReminderPermissionState> {
  const emailHash = commercialEmailHash(email);
  const { data: suppression, error: suppressionError } = await supabaseServer
    .from("commercial_email_suppressions").select("email_hash")
    .eq("email_hash", emailHash).maybeSingle();
  if (suppressionError) throw suppressionError;
  if (suppression) return "unsubscribed";
  const { data: choice, error: choiceError } = await supabaseServer
    .from("customer_reminder_choices").select("decision,customer_email")
    .eq("order_id", orderId).eq("email_hash", emailHash).maybeSingle();
  if (choiceError) throw choiceError;
  if (!choice || choice.customer_email !== email.trim().toLowerCase()) {
    return "no_recorded_preference";
  }
  return choice.decision === "requested" ? "affirmatively_requested"
    : choice.decision === "declined" ? "explicitly_declined"
    : "no_recorded_preference";
}
