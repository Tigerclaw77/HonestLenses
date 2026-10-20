import { commercialEmailHash } from "@/lib/orderOperations";
import { supabaseServer } from "@/lib/supabase-server";
import { estimateReplenishment } from "./estimate";
import { documentedExpiration, expirationReminderAt } from "./recallPolicy";
import { isExplicitDraftOrTest } from "@/lib/orders/operationalQueue";
import { getAuthoritativeOrderQuantity } from "@/lib/orders/orderQuantity";
import { hasPrescriptionReminderAuthority, reminderPermissionState } from "./permission";
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
export async function scheduleReorderReminder(
  orderId: string, options: { refreshDelivery?: boolean } = {},
): Promise<void> {
  const { data: order, error: orderError } = await supabaseServer.from("orders")
    .select("id,status,created_at,shipping_email,shipping_first_name,shipping_last_name,patient_name,patient_full_name,fulfillment_status,admin_notes,sku,right_box_count,left_box_count,total_box_count,box_count,adjusted_right_box_count,adjusted_left_box_count,adjusted_total_box_count,rx,rx_expiration_date,verification_status,verification_passed,verification_completed_at,patient_first_name,patient_last_name,patient_dob,rx_patient_name,rx_dob")
    .eq("id", orderId).maybeSingle();
  if (orderError || !order) throw new Error("Reminder order unavailable");
  if (!order.shipping_email || order.fulfillment_status === "cancelled" ||
      !["captured", "paid", "shipped", "completed"].includes(order.status)) return;
  if (isExplicitDraftOrTest(order)) return;
  const emailHash = commercialEmailHash(order.shipping_email);
  const { data: suppression, error: suppressionError } = await supabaseServer
    .from("commercial_email_suppressions").select("email_hash")
    .eq("email_hash", emailHash).maybeSingle();
  if (suppressionError) throw suppressionError;
  if (suppression) return;

  const { data: existing, error: existingError } = await supabaseServer
    .from("reorder_reminder_preferences").select("order_id,stopped_at,send_count")
    .eq("order_id", orderId).maybeSingle();
  if (existingError) throw existingError;
  if (existing?.stopped_at) return;
  if (options.refreshDelivery) {
    if (!existing || existing.send_count > 0) return; // Never enroll an old order.
    const { data: customerControl, error: controlError } = await supabaseServer
      .from("reorder_reminder_events").select("id").eq("order_id", orderId)
      .in("event_type", ["postponed", "stopped"]).limit(1).maybeSingle();
    if (controlError) throw controlError;
    if (customerControl) return; // Keep a customer-selected date or opt-out.
  } else if (existing) return; // Webhook replay never resets a customer's postponement.

  const { data: newer, error: newerError } = await supabaseServer.from("orders")
    .select("id").eq("shipping_email", order.shipping_email)
    .neq("id", orderId).eq("status", "captured")
    .gt("created_at", order.created_at).limit(1).maybeSingle();
  if (newerError) throw newerError;
  if (newer) return; // Delayed webhook replay cannot reinstate an older supply schedule.
  if (await reminderPermissionState(orderId, order.shipping_email) !==
      "affirmatively_requested") return;
  const { data: receipt, error: receiptError } = await supabaseServer
    .from("order_receipt_snapshots").select("captured_at")
    .eq("order_id", orderId).maybeSingle();
  if (receiptError) throw receiptError;
  const { data: fulfillmentEvents, error: fulfillmentError } = await supabaseServer
    .from("order_events").select("created_at,after")
    .eq("order_id", orderId)
    .in("event_type", ["admin_fulfillment_updated", "admin_fulfillment_override"])
    .order("created_at", { ascending: false }).limit(20);
  if (fulfillmentError) throw fulfillmentError;
  const deliveredAt = (fulfillmentEvents ?? []).find(event =>
    event.after && typeof event.after === "object" &&
    (event.after as { fulfillment_status?: string }).fulfillment_status === "delivered")?.created_at;
  const quantity = getAuthoritativeOrderQuantity(order);
  const estimate = estimateReplenishment({
    sku: order.sku, rightBoxes: quantity.right,
    leftBoxes: quantity.left, rx: order.rx,
    orderedAt: receipt?.captured_at ?? order.created_at,
    deliveredAt,
  });
  if (options.refreshDelivery) {
    if (!deliveredAt || !estimate) return;
    const { error: updateError } = await supabaseServer
      .from("reorder_reminder_preferences")
      .update({ next_reminder_at: estimate.reminderAt, updated_at: new Date().toISOString() })
      .eq("order_id", orderId).is("stopped_at", null);
    if (updateError) throw updateError;
    return;
  }

  let expirationAt: string | null = null;
  const expiration = documentedExpiration(order);
  if (expiration && await hasPrescriptionReminderAuthority(orderId, order.shipping_email)) {
    const { data: evidence, error: evidenceError } = await supabaseServer.from("order_events")
      .select("id").eq("order_id", orderId)
      .in("event_type", ["admin_prescription_accepted", "admin_verification_override",
        "verification_verified", "verification_passive_auto",
        "verification_passive_already_captured", "verification_uploaded_auto"])
      .limit(1).maybeSingle();
    if (evidenceError) throw evidenceError;
    if (evidence) expirationAt = expirationReminderAt(expiration);
  }
  const { error: cancelError } = await supabaseServer.from("reorder_reminder_preferences")
    .update({ next_reminder_at: null, next_expiration_at: null, updated_at: new Date().toISOString() })
    .eq("email_hash", emailHash).neq("order_id", orderId).is("stopped_at", null);
  if (cancelError) throw cancelError;
  if (!estimate && !expirationAt) return; // New purchase still invalidates the old schedule.
  const { error: insertError } = await supabaseServer.from("reorder_reminder_preferences")
    .upsert({ order_id: orderId, email_hash: emailHash,
      next_reminder_at: estimate?.reminderAt ?? null, next_expiration_at: expirationAt },
      { onConflict: "order_id", ignoreDuplicates: true });
  if (insertError) throw insertError;
  await ensureReminderControls(orderId);
  const { error: eventError } = await supabaseServer.from("reorder_reminder_events")
    .upsert({ order_id: orderId, event_type: "scheduled",
      event_key: `scheduled:${orderId}`,
      details: { estimated_supply_days: estimate?.estimatedSupplyDays ?? null,
        depletion_at: estimate?.depletionAt ?? null, confidence: estimate?.confidence ?? null,
        delivery_basis: estimate?.deliveryBasis ?? null, eye_basis: estimate?.eyeBasis ?? null,
        wear_basis: estimate?.wearBasis ?? null,
        expiration_scheduled: Boolean(expirationAt) } },
      { onConflict: "event_key", ignoreDuplicates: true });
  if (eventError) throw eventError;
}
