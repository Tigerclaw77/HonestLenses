export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  canAccessOrder,
  getOrderAccess,
  hasOrderAccessContext,
} from "@/lib/order-access";
import {
  isAbandonmentFeedbackEnabled,
  isFeedbackExperimentEligibleOrder,
} from "@/lib/abandonmentFeedback";

type FeedbackEligibilityOrder = {
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

export async function GET(req: Request) {
  if (!isAbandonmentFeedbackEnabled()) {
    return NextResponse.json({ eligible: false });
  }

  const access = await getOrderAccess(req);
  if (!hasOrderAccessContext(access)) {
    return NextResponse.json({ eligible: false });
  }

  const url = new URL(req.url);
  const orderId = url.searchParams.get("orderId");

  if (!orderId) {
    return NextResponse.json({ eligible: false });
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
    .maybeSingle<FeedbackEligibilityOrder>();

  if (error || !order || !canAccessOrder(access, order)) {
    return NextResponse.json({ eligible: false });
  }

  const eligible =
    !order.feedback_survey_shown_at &&
    isFeedbackExperimentEligibleOrder(order);

  return NextResponse.json({
    eligible,
    orderId: order.id,
    cartValueCents: order.total_amount_cents ?? 0,
    guestVsAuthenticated: access.userId ? "authenticated" : "guest",
  });
}
