import { Resend, type WebhookEventPayload } from "resend";

export const EMAIL_DELIVERY_ATTENTION_LABEL =
  "Invalid or Undeliverable Email";

export type ResendWebhookHeaders = {
  id: string;
  timestamp: string;
  signature: string;
};

export type NormalizedResendDeliveryEvent = {
  svixId: string;
  eventType: string;
  emailId: string;
  eventAt: string;
  orderId: string | null;
  emailType: string | null;
  recipient: string | null;
  deliveryStatus:
    | "delivered"
    | "bounced"
    | "complained"
    | "delivery_delayed"
    | "failed"
    | "suppressed";
  failureReason: string | null;
  requiresAttention: boolean;
};

export type DeliveryEventApplyResult = {
  duplicate?: boolean;
  matched?: boolean;
  order_id?: string;
};

type EventProcessorResult = {
  ignored: boolean;
  duplicate: boolean;
  matched: boolean;
  orderId: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstRecipient(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  return stringValue(value[0]);
}

function getTag(tags: unknown, name: string): string | null {
  if (isRecord(tags)) return stringValue(tags[name]);
  if (!Array.isArray(tags)) return null;

  for (const tag of tags) {
    if (!isRecord(tag) || tag.name !== name) continue;
    return stringValue(tag.value);
  }

  return null;
}

function validUuid(value: string | null): string | null {
  return value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
    ? value
    : null;
}

function eventDate(event: Record<string, unknown>, data: Record<string, unknown>) {
  const candidate = stringValue(event.created_at) ?? stringValue(data.created_at);
  if (!candidate || !Number.isFinite(new Date(candidate).getTime())) return null;
  return new Date(candidate).toISOString();
}

function bounceReason(data: Record<string, unknown>): string {
  const bounce = isRecord(data.bounce) ? data.bounce : null;
  const message = stringValue(bounce?.message);
  const diagnostics = Array.isArray(bounce?.diagnosticCode)
    ? bounce.diagnosticCode.filter((value): value is string => typeof value === "string")
    : [];

  return [message, ...diagnostics].filter(Boolean).join(" | ") || "Email permanently bounced.";
}

export function verifyResendWebhook(
  payload: string,
  headers: ResendWebhookHeaders,
  webhookSecret: string,
): WebhookEventPayload {
  const verifier = new Resend("re_webhook_verification_only");
  return verifier.webhooks.verify({
    payload,
    headers,
    webhookSecret,
  });
}

export function normalizeResendDeliveryEvent(
  event: unknown,
  svixId: string,
): NormalizedResendDeliveryEvent | null {
  if (!isRecord(event) || !isRecord(event.data)) return null;

  const eventType = stringValue(event.type);
  const emailId = stringValue(event.data.email_id);
  const eventAt = eventDate(event, event.data);

  if (!eventType || !emailId || !eventAt || !svixId) return null;

  let deliveryStatus: NormalizedResendDeliveryEvent["deliveryStatus"];
  let failureReason: string | null = null;
  let requiresAttention = false;

  if (eventType === "email.delivered") {
    deliveryStatus = "delivered";
  } else if (eventType === "email.bounced") {
    deliveryStatus = "bounced";
    failureReason = bounceReason(event.data);
    requiresAttention = true;
  } else if (eventType === "email.complained") {
    deliveryStatus = "complained";
    failureReason = "Recipient marked the email as spam.";
    requiresAttention = true;
  } else if (eventType === "email.delivery_delayed") {
    deliveryStatus = "delivery_delayed";
    failureReason = "The recipient mail server temporarily delayed delivery.";
  } else if (eventType === "email.failed") {
    const failed = isRecord(event.data.failed) ? event.data.failed : null;
    deliveryStatus = "failed";
    failureReason = stringValue(failed?.reason) ?? "Resend could not send the email.";
    requiresAttention = true;
  } else if (eventType === "email.suppressed") {
    const suppressed = isRecord(event.data.suppressed)
      ? event.data.suppressed
      : null;
    deliveryStatus = "suppressed";
    failureReason =
      stringValue(suppressed?.message) ?? "Recipient is on the suppression list.";
    requiresAttention = true;
  } else {
    return null;
  }

  return {
    svixId,
    eventType,
    emailId,
    eventAt,
    orderId: validUuid(getTag(event.data.tags, "order_id")),
    emailType: getTag(event.data.tags, "email_type"),
    recipient: firstRecipient(event.data.to),
    deliveryStatus,
    failureReason,
    requiresAttention,
  };
}

export async function processResendDeliveryEvent(
  event: unknown,
  svixId: string,
  applyEvent: (
    normalized: NormalizedResendDeliveryEvent,
  ) => Promise<DeliveryEventApplyResult>,
): Promise<EventProcessorResult> {
  const normalized = normalizeResendDeliveryEvent(event, svixId);
  if (!normalized) {
    return { ignored: true, duplicate: false, matched: false, orderId: null };
  }

  const result = await applyEvent(normalized);
  return {
    ignored: false,
    duplicate: Boolean(result.duplicate),
    matched: Boolean(result.matched),
    orderId: result.order_id ?? normalized.orderId,
  };
}
