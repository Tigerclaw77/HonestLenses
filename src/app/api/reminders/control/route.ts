export const runtime = "nodejs";

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { hasTrustedMutationOrigin } from "@/lib/auth/authorization";
import { enforceRateLimit, rateLimitErrorResponse } from "@/lib/security/rateLimit";
import { supabaseServer } from "@/lib/supabase-server";
import { captureServerEvent } from "@/lib/posthog/server";
import { POSTHOG_EVENTS } from "@/lib/posthog/events";
import { hashReorderToken, isReorderToken, REMINDER_ACTIONS, type ReminderAction } from "@/lib/reorder/tokens";
import { nextEligibleAt } from "@/lib/reorder/recallPolicy";

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const action = body?.action as ReminderAction;
  if (!REMINDER_ACTIONS.includes(action) || !isReorderToken(body?.token)) {
    return NextResponse.json({ error: "Invalid reminder link." }, { status: 400 });
  }
  const tokenHash = hashReorderToken(body.token);
  const limit = await enforceRateLimit(request, {
    scope: "reminder-control", identity: tokenHash, limit: 12, windowSeconds: 3600,
  });
  if (!limit.allowed) return rateLimitErrorResponse(limit);
  const { data: control, error: controlError } = await supabaseServer
    .from("reorder_reminder_control_tokens").select("order_id")
    .eq("token_hash", tokenHash).eq("action", action).is("revoked_at", null).maybeSingle();
  if (controlError) return NextResponse.json({ error: "Reminder controls unavailable." }, { status: 503 });
  if (!control) return NextResponse.json({ error: "This reminder link is unavailable." }, { status: 410 });
  const { data: preference, error: preferenceError } = await supabaseServer
    .from("reorder_reminder_preferences").select("order_id,email_hash,stopped_at,next_expiration_at")
    .eq("order_id", control.order_id).maybeSingle();
  if (preferenceError || !preference) {
    return NextResponse.json({ error: "Reminder preference unavailable." }, { status: 503 });
  }
  if (action === "stop") {
    const now = new Date().toISOString();
    const { error: suppressionError } = await supabaseServer
      .from("commercial_email_suppressions")
      .upsert({ email_hash: preference.email_hash, reason: "reorder_reminder_opt_out" },
        { onConflict: "email_hash", ignoreDuplicates: true });
    if (suppressionError) return NextResponse.json({ error: "Unable to stop reminders." }, { status: 503 });
    const { error: stopError } = await supabaseServer.from("reorder_reminder_preferences")
      .update({ stopped_at: now, next_reminder_at: null, next_expiration_at: null, updated_at: now })
      .eq("email_hash", preference.email_hash);
    if (stopError) return NextResponse.json({ error: "Unable to stop reminders." }, { status: 503 });
  } else {
    if (preference.stopped_at) return NextResponse.json({ error: "Reminders have been stopped." }, { status: 410 });
    const { data: suppression, error: suppressionError } = await supabaseServer
      .from("commercial_email_suppressions").select("email_hash")
      .eq("email_hash", preference.email_hash).maybeSingle();
    if (suppressionError) return NextResponse.json({ error: "Reminder controls unavailable." }, { status: 503 });
    if (suppression) return NextResponse.json({ error: "Reminders have been stopped." }, { status: 410 });
    const { data: order, error: orderError } = await supabaseServer.from("orders")
      .select("shipping_email").eq("id", control.order_id).maybeSingle();
    if (orderError || !order?.shipping_email) return NextResponse.json({ error: "Order unavailable." }, { status: 410 });
    const { data: latest, error: latestError } = await supabaseServer.from("orders")
      .select("id").eq("shipping_email", order.shipping_email).eq("status", "captured")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (latestError || latest?.id !== control.order_id) {
      return NextResponse.json({ error: "Use the reminder controls for your latest order." }, { status: 410 });
    }
    const now = Date.now();
    let next: number;
    if (action === "custom") {
      next = typeof body.date === "string" ? Date.parse(`${body.date}T12:00:00Z`) : NaN;
      if (!Number.isFinite(next) || next < now + 86_400_000 || next > now + 365 * 86_400_000) {
        return NextResponse.json({ error: "Choose a date within the next year." }, { status: 400 });
      }
    } else {
      next = now + Number(action.slice(-2)) * 86_400_000;
    }
    const { data: claim, error: claimError } = await supabaseServer
      .from("reorder_recall_recipient_claims").select("claimed_at,status")
      .eq("email_hash", preference.email_hash).maybeSingle();
    if (claimError) return NextResponse.json({ error: "Reminder controls unavailable." }, { status: 503 });
    const eligible = claim?.status === "accepted" ? nextEligibleAt(claim.claimed_at) : null;
    const effective = Math.max(next, eligible ? Date.parse(eligible) : 0);
    const existingExpiration = preference.next_expiration_at
      ? Date.parse(preference.next_expiration_at) : NaN;
    const { error: updateError } = await supabaseServer.from("reorder_reminder_preferences")
      .update({ next_reminder_at: new Date(effective).toISOString(),
        next_expiration_at: Number.isFinite(existingExpiration)
          ? new Date(Math.max(existingExpiration, effective)).toISOString() : null,
        updated_at: new Date(now).toISOString() })
      .eq("order_id", control.order_id).is("stopped_at", null);
    if (updateError) return NextResponse.json({ error: "Unable to postpone reminder." }, { status: 503 });
    const responseMessage = claim && claim.status !== "accepted"
      ? "Reminder saved. Sending is paused pending review of an earlier delivery."
      : effective > next
      ? `Reminder saved. The next eligible date is ${new Date(effective).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" })} because of the 30-day email limit.`
      : "Reminder date updated.";
    const { error: auditError } = await supabaseServer.from("reorder_reminder_events").insert({
      order_id: control.order_id, event_type: "postponed", event_key: `control:${randomUUID()}`,
      details: { action, effective_at: new Date(effective).toISOString() },
    });
    if (auditError) return NextResponse.json({ error: "Preference saved; audit is temporarily unavailable." }, { status: 503 });
    await captureServerEvent({ event: POSTHOG_EVENTS.REMINDER_POSTPONED, request, properties: { action } });
    return NextResponse.json({ ok: true, message: responseMessage,
      nextEligibleAt: new Date(effective).toISOString() });
  }
  const { error: auditError } = await supabaseServer.from("reorder_reminder_events").insert({
    order_id: control.order_id,
    event_type: "stopped",
    event_key: `control:${randomUUID()}`,
    details: { action },
  });
  if (auditError) return NextResponse.json({ error: "Preference saved; audit is temporarily unavailable." }, { status: 503 });
  await captureServerEvent({ event: POSTHOG_EVENTS.REMINDER_UNSUBSCRIBED,
    request, properties: { action } });
  return NextResponse.json({ ok: true, message: "Reminders stopped." });
}
