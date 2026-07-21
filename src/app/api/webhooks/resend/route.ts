export const runtime = "nodejs";

import { NextResponse } from "next/server";

import {
  processResendDeliveryEvent,
  verifyResendWebhook,
} from "@/lib/emailDelivery";
import { applyResendDeliveryEvent } from "@/lib/emailDeliveryServer";

export async function POST(req: Request) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("RESEND_WEBHOOK_SECRET is not configured");
    return NextResponse.json(
      { error: "Webhook is not configured." },
      { status: 503 },
    );
  }

  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
  }

  const payload = await req.text();
  let event: unknown;

  try {
    event = verifyResendWebhook(
      payload,
      {
        id: svixId,
        timestamp: svixTimestamp,
        signature: svixSignature,
      },
      webhookSecret,
    );
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
  }

  try {
    const result = await processResendDeliveryEvent(
      event,
      svixId,
      applyResendDeliveryEvent,
    );

    if (result.ignored) {
      console.info("Ignoring unsupported Resend webhook event", {
        svixId,
        type:
          typeof event === "object" && event !== null && "type" in event
            ? event.type
            : null,
      });
    } else if (!result.matched && !result.duplicate) {
      console.warn("Resend webhook did not match an order", { svixId });
    }

    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    console.error("Resend webhook processing failed", { svixId, error });
    return NextResponse.json(
      { error: "Webhook processing failed." },
      { status: 500 },
    );
  }
}
