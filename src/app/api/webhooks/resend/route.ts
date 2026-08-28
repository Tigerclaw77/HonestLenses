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
import {
  forwardInboundEmail,
  type InboundEmailForwardInput,
  type InboundEmailForwardResult,
} from "@/lib/inboundEmailForwarding";

type ResendWebhookDependencies = {
  webhookSecret?: string;
  verifyWebhook?: typeof verifyResendWebhook;
  applyEvent?: (
    event: NormalizedResendDeliveryEvent,
  ) => Promise<DeliveryEventApplyResult>;
  forwardInboundEmail?: (
    input: InboundEmailForwardInput,
  ) => Promise<InboundEmailForwardResult>;
};

function inboundEmailInput(
  event: unknown,
  svixId: string,
): InboundEmailForwardInput | null {
  if (
    typeof event !== "object" ||
    event === null ||
    !("type" in event) ||
    event.type !== "email.received" ||
    !("data" in event) ||
    typeof event.data !== "object" ||
    event.data === null
  ) {
    return null;
  }

  const data = event.data as Record<string, unknown>;
  const emailId = typeof data.email_id === "string" ? data.email_id.trim() : "";
  const receivedAt = typeof data.created_at === "string" ? data.created_at.trim() : "";
  const sender = typeof data.from === "string" ? data.from.trim() || null : null;
  const recipient = Array.isArray(data.to) && typeof data.to[0] === "string"
    ? data.to[0].trim() || null
    : null;

  if (!emailId || !receivedAt || Number.isNaN(new Date(receivedAt).getTime())) {
    return null;
  }

  return { svixId, emailId, receivedAt, sender, recipient };
}

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
    const inbound = inboundEmailInput(event, svixId);
    if (inbound) {
      const result = await (dependencies.forwardInboundEmail ?? forwardInboundEmail)(inbound);
      return NextResponse.json({ received: true, inbound: true, ...result });
    }

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
