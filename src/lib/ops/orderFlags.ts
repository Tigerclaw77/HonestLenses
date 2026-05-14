export type OperationalFlagSeverity = "info" | "warning" | "critical";

export type OperationalFlagCode =
  | "abandoned_draft"
  | "stale_authorization"
  | "verification_blocked"
  | "verification_overdue"
  | "missing_payment_intent"
  | "missing_rx_path";

export type OperationalFlag = {
  code: OperationalFlagCode;
  severity: OperationalFlagSeverity;
  label: string;
};

export type OrderFlagSnapshot = {
  status?: string | null;
  verification_status?: string | null;
  created_at?: string | null;
  payment_intent_id?: string | null;
  rx_upload_path?: string | null;
  prescriber_name?: string | null;
  passive_deadline_at?: string | null;
};

const HOUR_MS = 1000 * 60 * 60;

function hoursSince(value: string | null | undefined, now: Date): number | null {
  if (!value) return null;

  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;

  return Math.max(0, (now.getTime() - time) / HOUR_MS);
}

function isVerifiedLike(status: string | null | undefined): boolean {
  return (
    status === "verified" ||
    status === "auto_verified" ||
    status === "ocr_verified" ||
    status === "upload_verified"
  );
}

export function getOrderOperationalFlags(
  order: OrderFlagSnapshot,
  now = new Date(),
): OperationalFlag[] {
  const flags: OperationalFlag[] = [];
  const ageHours = hoursSince(order.created_at, now);

  if (order.status === "draft" && ageHours !== null && ageHours >= 2) {
    flags.push({
      code: "abandoned_draft",
      severity: "warning",
      label: "Draft older than 2 hours",
    });
  }

  if (
    order.status === "authorized" &&
    ageHours !== null &&
    ageHours >= 24 &&
    !isVerifiedLike(order.verification_status)
  ) {
    flags.push({
      code: "stale_authorization",
      severity: "critical",
      label: "Authorized order not verified within 24 hours",
    });
  }

  if (
    !isVerifiedLike(order.verification_status) &&
    !order.rx_upload_path &&
    !order.prescriber_name
  ) {
    flags.push({
      code: "verification_blocked",
      severity: "critical",
      label: "No Rx upload or prescriber path",
    });
  }

  if (
    order.passive_deadline_at &&
    new Date(order.passive_deadline_at).getTime() < now.getTime() &&
    !isVerifiedLike(order.verification_status)
  ) {
    flags.push({
      code: "verification_overdue",
      severity: "critical",
      label: "Passive verification deadline passed",
    });
  }

  if (order.status === "authorized" && !order.payment_intent_id) {
    flags.push({
      code: "missing_payment_intent",
      severity: "critical",
      label: "Authorized order missing PaymentIntent",
    });
  }

  if (
    order.verification_status === "upload_verified" &&
    !order.rx_upload_path
  ) {
    flags.push({
      code: "missing_rx_path",
      severity: "warning",
      label: "Upload-verified order missing Rx file path",
    });
  }

  return flags;
}
