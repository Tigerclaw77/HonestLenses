export const FOUNDER_ALERT_TYPES = [
  "order_authorized",
  "rx_uploaded_review",
  "verification_completed",
  "passive_verification_completed",
  "ready_to_order",
  "receipt_snapshot_failed",
  "receipt_access_email_failed",
] as const;

export type FounderAlertType = (typeof FOUNDER_ALERT_TYPES)[number];

type FounderAlertEnvironment = Partial<Pick<
  NodeJS.ProcessEnv,
  "FOUNDER_ALERT_EMAIL" | "ARMORY_OPERATOR_ALERT_RECIPIENT" | "ADMIN_ALERT_EMAIL"
>>;

type FounderAlertKeyInput = {
  orderId: string;
  type: FounderAlertType;
  dedupeSuffix?: string;
};

type UploadedRxAlertOrder = {
  status?: string | null;
  payment_intent_id?: string | null;
};

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Founder-only alerts intentionally do not use ADMIN_ALERT_EMAIL. That address
 * is the customer-support mailbox and must never receive operational-only flow.
 */
export function getFounderAlertRecipient(
  environment: FounderAlertEnvironment = process.env as FounderAlertEnvironment,
): string {
  const configured = [
    environment.FOUNDER_ALERT_EMAIL,
    environment.ARMORY_OPERATOR_ALERT_RECIPIENT,
  ]
    .map((value) => value?.trim() ?? "")
    .find(Boolean);

  if (!configured || !isEmail(configured)) {
    throw new Error("Founder operational alert recipient is not configured");
  }

  return configured;
}

export function founderAlertKey({
  orderId,
  type,
  dedupeSuffix,
}: FounderAlertKeyInput): string {
  const suffix = dedupeSuffix?.trim() || "state-v1";
  return `founder-alert:${type}:${orderId}:${suffix}`.slice(0, 256);
}

/**
 * Uploading a prescription while building a cart is customer progress, not an
 * operator task. Checkout authorization emits the normal founder alert once
 * the order becomes actionable. This upload-specific alert is reserved for a
 * new or replacement prescription added after payment authorization.
 */
export function shouldSendUploadedRxFounderAlert(
  order: UploadedRxAlertOrder,
): boolean {
  return (
    order.status === "authorized" &&
    typeof order.payment_intent_id === "string" &&
    order.payment_intent_id.trim().length > 0
  );
}
