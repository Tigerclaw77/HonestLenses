import { commercialEmailHash } from "@/lib/orderOperations";
import { supabaseServer } from "@/lib/supabase-server";
import { estimateReplenishment } from "./estimate";
import { createReminderControlToken, hashReorderToken, REMINDER_ACTIONS } from "./tokens";

export async function ensureReminderControls(orderId: string): Promise<void> {
  for (const action of REMINDER_ACTIONS) {
    const tokenHash = hashReorderToken(createReminderControlToken(orderId, action));
    const { data: existing, error: lookupError } = await supabaseServer
      .from("reorder_reminder_control_tokens").select("token_hash,revoked_at")
      .eq("order_id", orderId).eq("action", action).maybeSingle();
    if (lookupError) throw lookupError;
    if (existing?.revoked_at || (existing && existing.token_hash !== tokenHash)) continue;
    if (!existing) {
      const { error } = await supabaseServer.from("reorder_reminder_control_tokens")
        .upsert({ order_id: orderId, action, token_hash: tokenHash },
          { onConflict: "order_id,action", ignoreDuplicates: true });
      if (error) throw error;
    }
  }
}

/** Creates an inert schedule; the live sender has a separate disabled-by-default gate. */
export async function scheduleReorderReminder(orderId: string): Promise<void> {
  const { data: order, error: orderError } = await supabaseServer.from("orders")
    .select("id,status,created_at,shipping_email,sku,right_box_count,left_box_count")
    .eq("id", orderId).maybeSingle();
  if (orderError || !order) throw new Error("Reminder order unavailable");
  if (!order.shipping_email || !["captured", "paid", "shipped", "completed"].includes(order.status)) return;
  const emailHash = commercialEmailHash(order.shipping_email);
  const { data: suppression, error: suppressionError } = await supabaseServer
    .from("commercial_email_suppressions").select("email_hash")
    .eq("email_hash", emailHash).maybeSingle();
  if (suppressionError) throw suppressionError;
  if (suppression) return;

  const { data: existing, error: existingError } = await supabaseServer
    .from("reorder_reminder_preferences").select("order_id,stopped_at")
    .eq("order_id", orderId).maybeSingle();
  if (existingError) throw existingError;
  if (existing?.stopped_at) return;
  if (existing) return; // Webhook replay never resets a customer's postponement.

  const { data: previous, error: previousError } = await supabaseServer.from("orders")
    .select("created_at").eq("shipping_email", order.shipping_email)
    .neq("id", orderId).eq("status", "captured")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (previousError) throw previousError;
  const estimate = estimateReplenishment({
    sku: order.sku, rightBoxes: order.right_box_count ?? 0,
    leftBoxes: order.left_box_count ?? 0, orderedAt: order.created_at,
    previousOrderAt: previous?.created_at,
  });
  if (!estimate) return;

  const { error: cancelError } = await supabaseServer.from("reorder_reminder_preferences")
    .update({ next_reminder_at: null, updated_at: new Date().toISOString() })
    .eq("email_hash", emailHash).neq("order_id", orderId).is("stopped_at", null);
  if (cancelError) throw cancelError;
  const { error: insertError } = await supabaseServer.from("reorder_reminder_preferences")
    .upsert({ order_id: orderId, email_hash: emailHash,
      next_reminder_at: estimate.reminderAt },
      { onConflict: "order_id", ignoreDuplicates: true });
  if (insertError) throw insertError;
  await ensureReminderControls(orderId);
  const { error: eventError } = await supabaseServer.from("reorder_reminder_events")
    .upsert({ order_id: orderId, event_type: "scheduled",
      event_key: `scheduled:${orderId}`,
      details: { basis: estimate.basis, estimated_supply_days: estimate.estimatedSupplyDays } },
      { onConflict: "event_key", ignoreDuplicates: true });
  if (eventError) throw eventError;
}
