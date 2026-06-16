export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseServer } from "@/lib/supabase-server";
import {
  canAccessOrder,
  getOrderAccess,
  hasOrderAccessContext,
} from "@/lib/order-access";
import { POSTHOG_EVENTS } from "@/lib/posthog/events";
import { captureServerEvent } from "@/lib/posthog/server";
import {
  ABANDONMENT_FEEDBACK_CREDIT_CENTS,
  getFeedbackAmountDueCents,
  isAbandonmentFeedbackEnabled,
  isAbandonmentFeedbackReason,
  isFeedbackExperimentEligibleOrder,
  sanitizeFeedbackText,
} from "@/lib/abandonmentFeedback";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

type FeedbackSubmitOrder = {
  id: string;
  user_id: string | null;
  status: string | null;
  rx: unknown;
  rx_upload_path: string | null;
  rx_source: string | null;
  verification_status: string | null;
  total_amount_cents: number | null;
  feedback_credit_cents: number | null;
  feedback_survey_completed_at: string | null;
  payment_intent_id: string | null;
};

type SubmitBody = {
  orderId?: unknown;
  reason?: unknown;
  lowerPriceSource?: unknown;
  notes?: unknown;
};

const PAYMENT_INTENT_AMOUNT_UPDATE_STATUSES = new Set([
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
]);

async function safeJson(req: Request): Promise<SubmitBody | null> {
  try {
    const body = await req.json();
    return typeof body === "object" && body !== null
      ? (body as SubmitBody)
      : null;
  } catch {
    return null;
  }
}

function buildFeedbackNotes(
  reason: string,
  lowerPriceSource: unknown,
  notes: unknown,
): string | null {
  const lowerPrice = sanitizeFeedbackText(lowerPriceSource);
  const generalNotes = sanitizeFeedbackText(notes);
  const parts: string[] = [];

  if (reason === "Found a lower price elsewhere" && lowerPrice) {
    parts.push(`Lower price source: ${lowerPrice}`);
  }

  if (generalNotes) {
    parts.push(generalNotes);
  }

  return parts.length ? parts.join("\n\n") : null;
}

async function syncPaymentIntentAmount(order: FeedbackSubmitOrder) {
  if (!order.payment_intent_id) return;

  const amountDueCents = getFeedbackAmountDueCents(order);
  const intent = await stripe.paymentIntents.retrieve(order.payment_intent_id);

  if (intent.amount === amountDueCents) return;

  if (!PAYMENT_INTENT_AMOUNT_UPDATE_STATUSES.has(intent.status)) {
    throw new Error(
      `PaymentIntent cannot be updated in status ${intent.status}.`,
    );
  }

  await stripe.paymentIntents.update(order.payment_intent_id, {
    amount: amountDueCents,
    metadata: {
      ...intent.metadata,
      order_id: order.id,
      feedback_credit_cents: String(order.feedback_credit_cents ?? 0),
      amount_due_cents: String(amountDueCents),
    },
  });
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
  const reason = isAbandonmentFeedbackReason(body?.reason)
    ? body.reason
    : null;

  if (!orderId || !reason) {
    return NextResponse.json(
      { error: "Missing feedback reason or order id." },
      { status: 400 },
    );
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
      feedback_survey_completed_at,
      payment_intent_id
    `,
    )
    .eq("id", orderId)
    .maybeSingle<FeedbackSubmitOrder>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!order || !canAccessOrder(access, order)) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  if (!isFeedbackExperimentEligibleOrder(order)) {
    return NextResponse.json(
      { error: "Order is not eligible for this feedback experiment." },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const feedbackNotes = buildFeedbackNotes(
    reason,
    body?.lowerPriceSource,
    body?.notes,
  );

  const { data: updatedOrder, error: updateError } = await supabaseServer
    .from("orders")
    .update({
      feedback_credit_cents: ABANDONMENT_FEEDBACK_CREDIT_CENTS,
      feedback_credit_applied_at: now,
      feedback_reason: reason,
      feedback_notes: feedbackNotes,
      feedback_survey_completed_at: now,
    })
    .eq("id", order.id)
    .eq("status", "draft")
    .eq("feedback_credit_cents", 0)
    .is("feedback_survey_completed_at", null)
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
      feedback_survey_completed_at,
      payment_intent_id
    `,
    )
    .maybeSingle<FeedbackSubmitOrder>();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (!updatedOrder) {
    return NextResponse.json(
      { error: "Feedback credit was already applied." },
      { status: 409 },
    );
  }

  try {
    await syncPaymentIntentAmount(updatedOrder);
  } catch (err) {
    await supabaseServer
      .from("orders")
      .update({
        feedback_credit_cents: 0,
        feedback_credit_applied_at: null,
        feedback_reason: null,
        feedback_notes: null,
        feedback_survey_completed_at: null,
      })
      .eq("id", updatedOrder.id)
      .eq("feedback_survey_completed_at", now);

    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Feedback credit was saved, but payment amount sync failed.",
      },
      { status: 502 },
    );
  }

  const analytics = {
    order_id: updatedOrder.id,
    cart_value: updatedOrder.total_amount_cents ?? 0,
    cart_value_cents: updatedOrder.total_amount_cents ?? 0,
    selected_reason: reason,
    guest_vs_authenticated: access.userId ? "authenticated" : "guest",
  };

  await captureServerEvent({
    event: POSTHOG_EVENTS.ABANDONMENT_SURVEY_SUBMITTED,
    distinctId: access.distinctId,
    request: req,
    properties: analytics,
  });

  await captureServerEvent({
    event: POSTHOG_EVENTS.ABANDONMENT_CREDIT_APPLIED,
    distinctId: access.distinctId,
    request: req,
    properties: {
      ...analytics,
      feedback_credit_cents: ABANDONMENT_FEEDBACK_CREDIT_CENTS,
      amount_due_cents: getFeedbackAmountDueCents(updatedOrder),
    },
  });

  return NextResponse.json({
    ok: true,
    feedback_credit_cents: ABANDONMENT_FEEDBACK_CREDIT_CENTS,
    amount_due_cents: getFeedbackAmountDueCents(updatedOrder),
  });
}
