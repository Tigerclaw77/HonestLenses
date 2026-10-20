import { sendEmail, EmailSendError } from "@/lib/email";
import { ensureReorderEntry } from "./entry";
import { commercialEmailHash } from "@/lib/orderOperations";
import { supabaseServer } from "@/lib/supabase-server";
import { captureServerEvent } from "@/lib/posthog/server";
import { POSTHOG_EVENTS } from "@/lib/posthog/events";
import { createReminderControlToken, type ReminderAction } from "./tokens";

type Due = { order_id: string; email_hash: string; next_reminder_at: string; send_count: number };

function baseUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://www.honestlenses.com")
    .replace(/\/$/, "");
}

function controlUrl(orderId: string, action: ReminderAction) {
  const token = createReminderControlToken(orderId, action);
  return `${baseUrl()}/reminders/${action}?token=${encodeURIComponent(token)}`;
}

export function buildReorderReminder({ orderId, firstName, reorderUrl, postalAddress }: {
  orderId: string; firstName: string; reorderUrl: string; postalAddress: string;
}) {
  const actions: [ReminderAction, string][] = [
    ["postpone_30", "Remind Me in 30 Days"],
    ["postpone_60", "Remind Me in 60 Days"],
    ["postpone_90", "Remind Me in 90 Days"],
    ["custom", "Choose a Reminder Date"],
    ["stop", "Stop Reminders"],
  ];
  const escape = (value: string) => value.replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[char]!);
  const links = actions.map(([action, label]) => ({ label, url: controlUrl(orderId, action) }));
  return {
    subject: "Ready for more contacts?",
    html: `<p>Hi ${escape(firstName)},</p><p>Need more contacts?</p><p>You can quickly reorder your previous lenses without entering everything again.</p><p><a href="${escape(reorderUrl)}">Reorder My Contacts</a></p><p>Not ready yet?</p>${links.map(link => `<p><a href="${escape(link.url)}">${link.label}</a></p>`).join("")}<p>Thank you for choosing Honest Lenses!</p><p>Honest Lenses · ${escape(postalAddress)}</p>`,
    text: `Hi ${firstName},\n\nNeed more contacts?\n\nYou can quickly reorder your previous lenses without entering everything again.\n\nReorder My Contacts: ${reorderUrl}\n\nNot ready yet?\n${links.map(link => `${link.label}: ${link.url}`).join("\n")}\n\nThank you for choosing Honest Lenses!\nHonest Lenses · ${postalAddress}`,
    headers: { "List-Unsubscribe": `<${controlUrl(orderId, "stop")}>` },
  };
}

async function event(orderId: string, eventType: string, key: string) {
  const { error } = await supabaseServer.from("reorder_reminder_events")
    .upsert({ order_id: orderId, event_type: eventType, event_key: key },
      { onConflict: "event_key", ignoreDuplicates: true });
  if (error) throw error;
}

/** Must remain disabled in production until privacy, legal, and deliverability review. */
export async function runReorderReminders(): Promise<{ enabled: boolean; examined: number; accepted: number }> {
  const { data: control, error: controlError } = await supabaseServer
    .from("order_operations_control")
    .select("reorder_reminders_enabled,postal_address").eq("id", true).single();
  if (controlError || !control) throw new Error("Reminder control unavailable");
  if (!control.reorder_reminders_enabled) return { enabled: false, examined: 0, accepted: 0 };
  if (!control.postal_address || control.postal_address.trim().length < 10) {
    throw new Error("Commercial sender address is not configured");
  }
  const { data: due, error: dueError } = await supabaseServer
    .from("reorder_reminder_preferences")
    .select("order_id,email_hash,next_reminder_at,send_count")
    .is("stopped_at", null).lte("next_reminder_at", new Date().toISOString())
    .order("next_reminder_at", { ascending: true }).limit(20);
  if (dueError) throw dueError;
  let accepted = 0;
  for (const preference of (due ?? []) as Due[]) {
    const { data: order, error: orderError } = await supabaseServer.from("orders")
      .select("id,status,shipping_email,shipping_first_name")
      .eq("id", preference.order_id).maybeSingle();
    if (orderError || !order?.shipping_email || order.status !== "captured" ||
        commercialEmailHash(order.shipping_email) !== preference.email_hash) continue;
    const { data: suppressed, error: suppressionError } = await supabaseServer
      .from("commercial_email_suppressions").select("email_hash")
      .eq("email_hash", preference.email_hash).maybeSingle();
    if (suppressionError) throw suppressionError;
    if (suppressed) {
      await supabaseServer.from("reorder_reminder_preferences")
        .update({ stopped_at: new Date().toISOString(), next_reminder_at: null })
        .eq("order_id", order.id);
      await event(order.id, "suppressed", `suppressed:${order.id}:${preference.next_reminder_at}`);
      continue;
    }
    const { error: claimError } = await supabaseServer.from("reorder_reminder_attempts")
      .insert({ order_id: order.id, scheduled_for: preference.next_reminder_at });
    if (claimError?.code === "23505") continue;
    if (claimError) throw claimError;
    await event(order.id, "queued", `queued:${order.id}:${preference.next_reminder_at}`);
    try {
      const reorderUrl = await ensureReorderEntry(order.id);
      const message = buildReorderReminder({
        orderId: order.id, firstName: order.shipping_first_name || "there",
        reorderUrl, postalAddress: control.postal_address,
      });
      const sent = await sendEmail({ to: order.shipping_email, ...message,
        tracking: { orderId: order.id, emailType: "reorder_reminder", updateOrderSummary: false },
        idempotencyKey: `reorder-reminder:${order.id}:${preference.next_reminder_at}`,
        redactProviderErrorLog: true });
      if (!sent.data?.id) throw new Error("Provider acceptance unconfirmed");
      const at = new Date().toISOString();
      const { error: recordError } = await supabaseServer.from("reorder_reminder_attempts")
        .update({ status: "accepted", provider_id: sent.data.id, completed_at: at })
        .eq("order_id", order.id).eq("scheduled_for", preference.next_reminder_at);
      if (recordError) throw recordError;
      const { error: preferenceError } = await supabaseServer.from("reorder_reminder_preferences")
        .update({ next_reminder_at: null, last_sent_at: at, updated_at: at,
          send_count: preference.send_count + 1 })
        .eq("order_id", order.id).eq("next_reminder_at", preference.next_reminder_at);
      if (preferenceError) throw preferenceError;
      await event(order.id, "accepted", `accepted:${order.id}:${preference.next_reminder_at}`);
      await captureServerEvent({ event: POSTHOG_EVENTS.REMINDER_SENT });
      accepted++;
    } catch (error) {
      const definite = error instanceof EmailSendError && error.definitivelyRejected;
      await supabaseServer.from("reorder_reminder_attempts")
        .update({ status: definite ? "rejected" : "unknown", completed_at: new Date().toISOString(),
          error_code: error instanceof Error ? error.name : "UNKNOWN" })
        .eq("order_id", order.id).eq("scheduled_for", preference.next_reminder_at)
        .eq("status", "claimed");
      // Ambiguous provider outcomes require operator review; never auto-retry a possible send.
      await supabaseServer.from("reorder_reminder_preferences")
        .update({ next_reminder_at: null })
        .eq("order_id", order.id).eq("next_reminder_at", preference.next_reminder_at);
    }
  }
  return { enabled: true, examined: due?.length ?? 0, accepted };
}
