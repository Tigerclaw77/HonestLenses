import Stripe from "stripe";

import { supabaseServer } from "@/lib/supabase-server";
import { getPaymentReconciliationDecision } from "@/lib/orders/adminPaymentReconciliation";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

export type AdminPaymentOrder = {
  id: string;
  status?: string | null;
  payment_intent_id?: string | null;
};

export function getAdminStripe(): Stripe | null {
  return stripe;
}

export async function reconcileAdminPaymentState({
  order,
  stripeStatus,
  actor,
  source,
}: {
  order: AdminPaymentOrder;
  stripeStatus: string | null | undefined;
  actor: string;
  source: "queue_refresh" | "operator_sync" | "operator_capture";
}): Promise<{ status: string | null; changed: boolean; eventLogged: boolean }> {
  const decision = getPaymentReconciliationDecision(order, stripeStatus);
  if (!decision.targetStatus || !decision.changed) {
    return {
      status: decision.targetStatus ?? order.status ?? null,
      changed: false,
      eventLogged: true,
    };
  }

  const updatedAt = new Date().toISOString();
  let updateQuery = supabaseServer
    .from("orders")
    .update({ status: decision.targetStatus, updated_at: updatedAt })
    .eq("id", order.id)
    .eq("payment_intent_id", order.payment_intent_id);
  updateQuery = order.status
    ? updateQuery.eq("status", order.status)
    : updateQuery.is("status", null);
  const { data, error } = await updateQuery.select("id, status").maybeSingle();

  if (error) throw error;
  if (!data) {
    return { status: decision.targetStatus, changed: false, eventLogged: true };
  }

  const { error: eventError } = await supabaseServer.from("order_events").insert({
    order_id: order.id,
    event_type: "admin_payment_reconciled",
    actor,
    message: `Payment state reconciled from Stripe (${stripeStatus ?? "unknown"}) via ${source}.`,
    before: { status: order.status ?? null },
    after: {
      status: decision.targetStatus,
      stripe_payment_intent_status: stripeStatus ?? null,
    },
  });

  if (eventError) {
    console.warn("Admin payment reconciliation event logging failed", {
      orderId: order.id,
      source,
      error: eventError.message,
    });
  }

  return {
    status: decision.targetStatus,
    changed: true,
    eventLogged: !eventError,
  };
}
