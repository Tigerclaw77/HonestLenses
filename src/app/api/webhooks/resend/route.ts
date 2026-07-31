export const runtime = "nodejs";

import { NextResponse } from "next/server";

import {
  assertValidResendWebhookPayload,
  InvalidResendWebhookPayloadError,
  type DeliveryEventApplyResult,
  type NormalizedResendDeliveryEvent,
  processResendDeliveryEvent,
  verifyResendWebhook,
} from "@/lib/emailDelivery";

type ResendWebhookDependencies = {
  webhookSecret?: string;
  verifyWebhook?: typeof verifyResendWebhook;
  applyEvent?: (
    event: NormalizedResendDeliveryEvent,
  ) => Promise<DeliveryEventApplyResult>;
};

export async function handleResendWebhook(
  req: Request,
  dependencies: ResendWebhookDependencies = {},
) {
  const webhookSecret =
    dependencies.webhookSecret ?? process.env.RESEND_WEBHOOK_SECRET;
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
    event = (dependencies.verifyWebhook ?? verifyResendWebhook)(
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
    assertValidResendWebhookPayload(event, svixId);
    const applyEvent =
      dependencies.applyEvent ??
      (await import("@/lib/emailDeliveryServer")).applyResendDeliveryEvent;
    const result = await processResendDeliveryEvent(
      event,
      svixId,
      applyEvent,
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
    if (error instanceof InvalidResendWebhookPayloadError) {
      return NextResponse.json(
        { error: "Invalid webhook payload." },
        { status: 400 },
      );
    }

    console.error("Resend webhook processing failed", { svixId, error });
    return NextResponse.json(
      { error: "Webhook processing failed." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  return handleResendWebhook(req);
}
