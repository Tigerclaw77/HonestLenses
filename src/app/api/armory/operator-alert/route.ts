export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { randomUUID, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import { escapeHtml, sanitizeEmailHeader } from "@/lib/email/html";

const ALERT_TYPES = new Set([
  "uncaptured_card",
  "rx_verification_needed",
  "blocked_failed_order",
  "supplier_site_change",
  "urgent_complaint_refund_dispute",
]);

const MAX_BODY_BYTES = 12_000;
const MAX_REAL_ALERTS_PER_HOUR = 5;
const MAX_REAL_ALERTS_PER_DAY = 20;
const IDEMPOTENCY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const READ_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
};
const sentAlertTimestamps: number[] = [];
const processedAlertKeys = new Map<string, { firstSeenAt: number; requestId: string }>();

type OperatorAlertPayload = {
  alertType?: unknown;
  orderId?: unknown;
  customer?: unknown;
  patient?: unknown;
  reason?: unknown;
  recommendedAction?: unknown;
  armoryLink?: unknown;
  severity?: unknown;
  dedupeKey?: unknown;
  condition?: unknown;
  conditionVersion?: unknown;
  generatedAt?: unknown;
  source?: unknown;
};

export async function POST(request: Request) {
  const requestId = randomUUID();
  const startedAt = Date.now();

  const bridgeMode = operatorAlertBridgeMode();
  if (bridgeMode.disabled) {
    logAccess({ requestId, outcome: bridgeMode.outcome, startedAt });
    return json({
      status: bridgeMode.status,
      provider: "honest-lenses-operator-alert-bridge",
      detail: bridgeMode.detail,
      requestId,
    }, 503);
  }

  if (!hasValidBearerToken(request)) {
    logAccess({ requestId, outcome: "unauthorized", startedAt });
    return json({ error: "Unauthorized" }, 401);
  }

  const recipient = configuredRecipient();
  if (!recipient) {
    logAccess({ requestId, outcome: "recipient_not_configured", startedAt });
    return json({ error: "Operator alert bridge is not configured." }, 503);
  }

  let payload: OperatorAlertPayload;
  try {
    payload = await readPayload(request);
  } catch {
    logAccess({ requestId, outcome: "invalid_json", startedAt });
    return json({ error: "Invalid JSON payload." }, 400);
  }

  const alert = normalizeAlert(payload);
  if (!alert.ok) {
    logAccess({ requestId, outcome: alert.outcome, startedAt });
    return json({ error: alert.error }, 400);
  }

  const idempotency = bridgeIdempotencyCheck(alert.value.idempotencyKey, Date.now(), requestId);
  if (!idempotency.allowed) {
    logAccess({
      requestId,
      outcome: "duplicate_suppressed",
      startedAt,
      alertType: alert.value.alertType,
      orderId: alert.value.orderId,
    });
    return json({
      status: "duplicate_suppressed",
      provider: "honest-lenses-operator-alert-bridge",
      detail: "Duplicate operator alert suppressed by bridge idempotency.",
      requestId,
    });
  }

  if (bridgeMode.dryRun) {
    logAccess({
      requestId,
      outcome: "dry_run",
      startedAt,
      alertType: alert.value.alertType,
      orderId: alert.value.orderId,
    });
    return json({
      status: "dry_run",
      provider: "honest-lenses-operator-alert-bridge",
      detail: bridgeMode.detail,
      requestId,
    });
  }

  const rateLimit = bridgeRateLimit(Date.now());
  if (!rateLimit.allowed) {
    logAccess({
      requestId,
      outcome: "rate_limited",
      startedAt,
      alertType: alert.value.alertType,
      orderId: alert.value.orderId,
    });
    return json({
      status: "blocked_rate_limit",
      provider: "honest-lenses-operator-alert-bridge",
      detail: rateLimit.detail,
      requestId,
    }, 429);
  }

  try {
    const message = operatorAlertMessage(alert.value);
    const result = await sendEmail({
      to: recipient,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });

    logAccess({
      requestId,
      outcome: "sent",
      startedAt,
      alertType: alert.value.alertType,
      orderId: alert.value.orderId,
    });

    return json({
      status: "sent",
      provider: "honest-lenses-resend",
      messageId: result.data?.id || null,
      requestId,
    });
  } catch (error) {
    logAccess({
      requestId,
      outcome: "send_failed",
      startedAt,
      alertType: alert.value.alertType,
      orderId: alert.value.orderId,
      errorCode: error instanceof Error ? error.name : "unknown",
    });
    return json({ error: "Operator alert delivery failed.", requestId }, 502);
  }
}

function operatorAlertBridgeMode() {
  if ((process.env.ARMORY_OPERATOR_ALERT_BRIDGE_DISABLED ?? "true").toLowerCase() !== "false") {
    return {
      disabled: true,
      dryRun: false,
      status: "disabled",
      outcome: "bridge_disabled",
      detail: "Operator alert bridge is disabled by default.",
    };
  }

  if ((process.env.ARMORY_OPERATOR_ALERT_BRIDGE_MODE || "dry_run").toLowerCase() !== "production") {
    return {
      disabled: false,
      dryRun: true,
      status: "dry_run",
      outcome: "bridge_dry_run",
      detail: "Operator alert bridge is in dry-run mode by default.",
    };
  }

  if ((process.env.ARMORY_OPERATOR_ALERT_BRIDGE_DRY_RUN ?? "true").toLowerCase() !== "false") {
    return {
      disabled: false,
      dryRun: true,
      status: "dry_run",
      outcome: "bridge_dry_run",
      detail: "Operator alert bridge dry-run is enabled by default.",
    };
  }

  return {
    disabled: false,
    dryRun: false,
    status: "production_enabled",
    outcome: "production_enabled",
    detail: "Operator alert bridge production delivery explicitly enabled.",
  };
}

function bridgeRateLimit(now: number) {
  const hourAgo = now - 60 * 60 * 1000;
  const dayAgo = now - 24 * 60 * 60 * 1000;
  while (sentAlertTimestamps.length > 0 && sentAlertTimestamps[0] < dayAgo) {
    sentAlertTimestamps.shift();
  }
  const sentLastHour = sentAlertTimestamps.filter((timestamp) => timestamp >= hourAgo).length;
  const sentLastDay = sentAlertTimestamps.length;
  if (sentLastHour >= MAX_REAL_ALERTS_PER_HOUR) {
    return {
      allowed: false,
      detail: `Hourly operator alert limit reached (${MAX_REAL_ALERTS_PER_HOUR}/hour).`,
    };
  }
  if (sentLastDay >= MAX_REAL_ALERTS_PER_DAY) {
    return {
      allowed: false,
      detail: `Daily operator alert limit reached (${MAX_REAL_ALERTS_PER_DAY}/day).`,
    };
  }
  sentAlertTimestamps.push(now);
  return { allowed: true, detail: "Operator alert allowed by bridge rate limit." };
}

async function readPayload(request: Request) {
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
    throw new Error("Payload too large");
  }
  return JSON.parse(text) as OperatorAlertPayload;
}

function normalizeAlert(payload: OperatorAlertPayload) {
  const alertType = cleanString(payload.alertType, 80);
  if (!ALERT_TYPES.has(alertType)) {
    return {
      ok: false as const,
      outcome: "invalid_alert_type",
      error: "Unsupported alert type.",
    };
  }

  const orderId = cleanString(payload.orderId, 120) || "System";
  const condition = cleanString(payload.condition, 120);
  const conditionVersion = cleanString(payload.conditionVersion, 120);
  const reason = cleanString(payload.reason, 800);
  const recommendedAction = cleanString(payload.recommendedAction, 800);
  if (!reason || !recommendedAction || !condition || !conditionVersion) {
    return {
      ok: false as const,
      outcome: "missing_required_fields",
      error: "reason, recommendedAction, condition, and conditionVersion are required.",
    };
  }

  const armoryLink = safeHttpUrl(cleanString(payload.armoryLink, 500))
    || process.env.ARMORY_CONSOLE_URL
    || "http://127.0.0.1:4319";

  return {
    ok: true as const,
    value: {
      alertType,
      orderId,
      customer: cleanString(payload.customer, 240) || "Unknown",
      patient: cleanString(payload.patient, 240) || "Unknown",
      reason,
      recommendedAction,
      armoryLink,
      severity: cleanString(payload.severity, 80) || "medium",
      condition,
      conditionVersion,
      idempotencyKey: bridgeIdempotencyKey(orderId, condition, conditionVersion),
      dedupeKey: cleanString(payload.dedupeKey, 240) || null,
      generatedAt: cleanString(payload.generatedAt, 80) || new Date().toISOString(),
      source: cleanString(payload.source, 80) || "armory",
    },
  };
}

function operatorAlertMessage(alert: {
  alertType: string;
  orderId: string;
  customer: string;
  patient: string;
  reason: string;
  recommendedAction: string;
  armoryLink: string;
  severity: string;
  generatedAt: string;
}) {
  const typeLabel = labelize(alert.alertType);
  const subject = sanitizeEmailHeader(
    `[Armory] ${typeLabel}: ${alert.orderId}`,
  ).slice(0, 160);

  const text = [
    "Armory needs an operator decision.",
    "",
    `Alert type: ${typeLabel}`,
    `Order ID: ${alert.orderId}`,
    `Patient: ${alert.patient}`,
    `Customer: ${alert.customer}`,
    `Severity: ${alert.severity}`,
    `Reason: ${alert.reason}`,
    `Recommended action: ${alert.recommendedAction}`,
    `Armory: ${alert.armoryLink}`,
    `Generated at: ${alert.generatedAt}`,
    "",
    "No customer email was sent. No supplier submission or production order update was performed.",
  ].join("\n");

  const html = `
    <h2>Armory needs an operator decision</h2>
    <p><strong>Alert type:</strong> ${escapeHtml(typeLabel)}</p>
    <p><strong>Order ID:</strong> ${escapeHtml(alert.orderId)}</p>
    <p><strong>Patient:</strong> ${escapeHtml(alert.patient)}</p>
    <p><strong>Customer:</strong> ${escapeHtml(alert.customer)}</p>
    <p><strong>Severity:</strong> ${escapeHtml(alert.severity)}</p>
    <p><strong>Reason:</strong> ${escapeHtml(alert.reason)}</p>
    <p><strong>Recommended action:</strong> ${escapeHtml(alert.recommendedAction)}</p>
    <p><a href="${escapeHtml(alert.armoryLink)}">Open Armory</a></p>
    <hr />
    <p>No customer email was sent. No supplier submission or production order update was performed.</p>
  `;

  return { subject, text, html };
}

function bridgeIdempotencyKey(orderId: string, condition: string, conditionVersion: string) {
  return `${orderId}:${condition}:${conditionVersion}`;
}

function bridgeIdempotencyCheck(idempotencyKey: string, now: number, requestId: string) {
  const cutoff = now - IDEMPOTENCY_WINDOW_MS;
  for (const [key, value] of processedAlertKeys.entries()) {
    if (value.firstSeenAt < cutoff) processedAlertKeys.delete(key);
  }
  if (processedAlertKeys.has(idempotencyKey)) {
    return { allowed: false };
  }
  processedAlertKeys.set(idempotencyKey, { firstSeenAt: now, requestId });
  return { allowed: true };
}

function hasValidBearerToken(request: Request) {
  const expected = process.env.ARMORY_OPERATOR_ALERT_TOKEN?.trim() || "";
  if (expected.length < 32) return false;
  const supplied = request.headers.get("authorization")?.trim() || "";
  const match = supplied.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  return safeEqual(match[1].trim(), expected);
}

function configuredRecipient() {
  const recipient = process.env.ARMORY_OPERATOR_ALERT_RECIPIENT?.trim() || "";
  const allowlist = (process.env.ARMORY_OPERATOR_ALERT_ALLOWED_RECIPIENTS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) return "";
  if (allowlist.length === 0) return "";
  if (!allowlist.includes(recipient.toLowerCase())) return "";
  return recipient;
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function cleanString(value: unknown, maxLength: number) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);
}

function safeHttpUrl(value: string) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function labelize(value: string) {
  return value.replace(/[_-]+/g, " ");
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: READ_HEADERS });
}

function logAccess({
  requestId,
  outcome,
  startedAt,
  alertType,
  orderId,
  errorCode,
}: {
  requestId: string;
  outcome: string;
  startedAt: number;
  alertType?: string;
  orderId?: string;
  errorCode?: string;
}) {
  console.info("[armory-operator-alert-bridge]", {
    requestId,
    outcome,
    durationMs: Date.now() - startedAt,
    alertType,
    orderId,
    errorCode,
  });
}
