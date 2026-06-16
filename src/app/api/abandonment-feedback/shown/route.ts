export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  canAccessOrder,
  getOrderAccess,
  hasOrderAccessContext,
} from "@/lib/order-access";
import { POSTHOG_EVENTS } from "@/lib/posthog/events";
import { captureServerEvent } from "@/lib/posthog/server";
import {
  isAbandonmentFeedbackEnabled,
  isFeedbackExperimentEligibleOrder,
} from "@/lib/abandonmentFeedback";

type FeedbackShownOrder = {
  id: string;
  user_id: string | null;
  status: string | null;
  rx: unknown;
  rx_upload_path: string | null;
  rx_source: string | null;
  verification_status: string | null;
  total_amount_cents: number | null;
  feedback_credit_cents: number | null;
  feedback_survey_shown_at: string | null;
  feedback_survey_completed_at: string | null;
};

type ShownBody = {
  orderId?: unknown;
  trigger?: unknown;
};

const VALID_TRIGGERS = new Set([
  "exit_intent",
  "back_navigation",
  "leave_page",
]);

async function safeJson(req: Request): Promise<ShownBody | null> {
  try {
    const body = await req.json();
    return typeof body === "object" && body !== null
      ? (body as ShownBody)
      : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  if (!isAbandonmentFeedbackEnabled()) {
    return NextResponse.json(
      { error: "Experiment disabled." },
      { status: 404 },
    );
  }

  const access = await getOrderAccess(req);
  if (!hasOrderAccessContext(access)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await safeJson(req);
  const orderId = typeof body?.orderId === "string" ? body.orderId : null;
  const trigger =
    typeof body?.trigger === "string" && VALID_TRIGGERS.has(body.trigger)
      ? body.trigger
      : "exit_intent";

  if (!orderId) {
    return NextResponse.json({ error: "Missing order id." }, { status: 400 });
  }

  const { data: order, error } = await supabaseServer
    .from("orders")
    .select(
      `
      id,
      user_id,
      status,
      rx,
      rx_upload_path,
      rx_source,
      verification_status,
      total_amount_cents,
      feedback_credit_cents,
      feedback_survey_shown_at,
      feedback_survey_completed_at
    `,
    )
    .eq("id", orderId)
    .maybeSingle<FeedbackShownOrder>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!order || !canAccessOrder(access, order)) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  if (order.feedback_survey_shown_at || !isFeedbackExperimentEligibleOrder(order)) {
    return NextResponse.json(
      { error: "Survey already shown or order is not eligible." },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const { data: updatedOrder, error: updateError } = await supabaseServer
    .from("orders")
    .update({ feedback_survey_shown_at: now })
    .eq("id", order.id)
    .eq("status", "draft")
    .eq("feedback_credit_cents", 0)
    .is("feedback_survey_shown_at", null)
    .is("feedback_survey_completed_at", null)
    .select("id, total_amount_cents")
    .maybeSingle<{ id: string; total_amount_cents: number | null }>();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (!updatedOrder) {
    return NextResponse.json(
      { error: "Survey was already shown." },
      { status: 409 },
    );
  }

  await captureServerEvent({
    event: POSTHOG_EVENTS.ABANDONMENT_SURVEY_SHOWN,
    distinctId: access.distinctId,
    request: req,
    properties: {
      order_id: updatedOrder.id,
      cart_value: updatedOrder.total_amount_cents ?? 0,
      cart_value_cents: updatedOrder.total_amount_cents ?? 0,
      selected_reason: null,
      guest_vs_authenticated: access.userId ? "authenticated" : "guest",
      trigger,
    },
  });

  return NextResponse.json({ ok: true });
}
