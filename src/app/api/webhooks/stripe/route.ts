export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { isCommerceV2Enabled } from "@/lib/commerce-v2/feature";
import { SupabaseCommerceRepository } from "@/lib/commerce-v2/repository";
import { createStripeGateway } from "@/lib/commerce-v2/stripeGateway";
import {
  processStripeWebhook,
  verifyStripeWebhook,
} from "@/lib/commerce-v2/webhookService";

export async function POST(request: Request) {
  if (!isCommerceV2Enabled()) {
    return NextResponse.json(
      { error: "Commerce v2 is not enabled." },
      { status: 503 },
    );
  }

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
