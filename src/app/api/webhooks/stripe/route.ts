export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { isCommerceV2Enabled } from "@/lib/commerce-v2/feature";
import { SupabaseCommerceRepository } from "@/lib/commerce-v2/repository";
import { createStripeGateway } from "@/lib/commerce-v2/stripeGateway";
import {
  processStripeWebhook,
  verifyStripeWebhook,
} from "@/lib/commerce-v2/webhookService";
import { supabaseServer } from "@/lib/supabase-server";
import {
  processLegacyStripeWebhook,
  type LegacyStripeWebhookRepository,
} from "@/lib/payments/legacyStripeWebhook";
import { ensureReceiptSnapshotWithoutAffectingPayment } from "@/lib/receipts/server";

const legacyRepository: LegacyStripeWebhookRepository = {
  async findOrder(orderId, paymentIntentId) {
    const { data, error } = await supabaseServer
      .from("orders")
      .select(
        "id, status, payment_intent_id, total_amount_cents, capture_amount_cents, feedback_credit_cents",
      )
      .eq("id", orderId)
      .eq("payment_intent_id", paymentIntentId)
      .maybeSingle();

    if (error) throw error;
    return data;
  },
  async markCaptured(orderId, paymentIntentId) {
    const { data, error } = await supabaseServer
      .from("orders")
      .update({ status: "captured", updated_at: new Date().toISOString() })
      .eq("id", orderId)
      .eq("payment_intent_id", paymentIntentId)
      .eq("status", "authorized")
      .select("id")
      .maybeSingle();

    if (error) throw error;
    return Boolean(data);
  },
};

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not configured");
    return NextResponse.json(
      { error: "Stripe webhook is not configured." },
      { status: 503 },
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "Invalid webhook signature." },
      { status: 400 },
    );
  }

  const rawBody = Buffer.from(await request.arrayBuffer());
  let event;
  try {
    event = verifyStripeWebhook(rawBody, signature, webhookSecret);
  } catch {
    return NextResponse.json(
      { error: "Invalid webhook signature." },
      { status: 400 },
    );
  }

  if (!isCommerceV2Enabled()) {
    try {
      const result = await processLegacyStripeWebhook(
        event,
        legacyRepository,
      );
      if (
        event.type === "payment_intent.succeeded" &&
        result.orderId &&
        !result.ignored
      ) {
        const intent = event.data.object;
        await ensureReceiptSnapshotWithoutAffectingPayment(
          result.orderId,
          intent.id,
          "stripe_webhook",
          new Date(event.created * 1000).toISOString(),
        );
      }
      return NextResponse.json({
        received: true,
        mode: "legacy",
        stripeEventId: event.id,
        ...result,
      });
    } catch (error) {
      console.error("Legacy Stripe webhook processing failed", {
        stripeEventId: event.id,
        error,
      });
      return NextResponse.json(
        { error: "Webhook processing failed." },
        { status: 500 },
      );
    }
  }

  try {
    const result = await processStripeWebhook(event, {
      repository: new SupabaseCommerceRepository(),
      stripe: createStripeGateway(),
    });
    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    console.error("Stripe webhook processing failed", {
      stripeEventId: event.id,
      error,
    });
    return NextResponse.json(
      { error: "Webhook processing failed." },
      { status: 500 },
    );
  }
}
