export const DEFAULT_ABANDONED_CHECKOUT_THRESHOLD_HOURS = 2;
export const DEFAULT_STALE_CHECKOUT_THRESHOLD_HOURS = 24;

export type AbandonedCheckoutReason =
  | "abandoned_no_payment_intent"
  | "abandoned_with_payment_intent"
  | "stale_checkout"
  | "incomplete_rx"
  | "incomplete_doctor_info";

export type AbandonedCheckoutRxMode =
  | "uploaded"
  | "doctor"
  | "structured_rx"
  | "none";

export type AbandonedCheckoutSnapshot = {
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  archived?: boolean | null;
  payment_intent_id?: string | null;
  rx?: unknown;
  rx_source?: string | null;
  rx_upload_path?: string | null;
  prescriber_name?: string | null;
  prescriber_email?: string | null;
  prescriber_phone?: string | null;
};

export type AbandonedCheckoutClassification = {
  isAbandoned: boolean;
  reasons: AbandonedCheckoutReason[];
  primaryReason: AbandonedCheckoutReason | null;
  ageHours: number | null;
  activityAt: string | null;
  thresholdHours: number;
  staleThresholdHours: number;
  rxMode: AbandonedCheckoutRxMode;
};

type ClassifyOptions = {
  now?: Date;
  thresholdHours?: number;
  staleThresholdHours?: number;
};

const HOUR_MS = 1000 * 60 * 60;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "";
}

function parseHours(
  value: string | null | undefined,
  fallback: number,
): number {
  if (!value) return fallback;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;

  return parsed;
}

function hoursSince(value: string | null | undefined, now: Date): number | null {
  if (!value) return null;

  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;

  return Math.max(0, (now.getTime() - time) / HOUR_MS);
}

function getActivityAt(order: AbandonedCheckoutSnapshot): string | null {
  return order.updated_at ?? order.created_at ?? null;
}

function hasStructuredRx(rx: unknown): boolean {
  if (!isObject(rx)) return false;

  const right = rx.right;
  const left = rx.left;

  return Boolean(
    (isObject(right) && hasValue(right.coreId)) ||
      (isObject(left) && hasValue(left.coreId)),
  );
}

function hasDoctorInfo(order: AbandonedCheckoutSnapshot): boolean {
  return Boolean(
    order.prescriber_name || order.prescriber_email || order.prescriber_phone,
  );
}

function getRxMode(
  order: AbandonedCheckoutSnapshot,
): AbandonedCheckoutRxMode {
  if (order.rx_upload_path || order.rx_source === "upload") return "uploaded";
  if (order.rx_source === "ocr") return "uploaded";
  if (hasDoctorInfo(order)) return "doctor";
  if (hasStructuredRx(order.rx)) return "structured_rx";
  return "none";
}

export function getAbandonedCheckoutThresholdHours(
  value?: string | null,
): number {
  return parseHours(value, DEFAULT_ABANDONED_CHECKOUT_THRESHOLD_HOURS);
}

export function getStaleCheckoutThresholdHours(value?: string | null): number {
  return parseHours(value, DEFAULT_STALE_CHECKOUT_THRESHOLD_HOURS);
}

export function classifyAbandonedCheckout(
  order: AbandonedCheckoutSnapshot,
  options: ClassifyOptions = {},
): AbandonedCheckoutClassification {
  const now = options.now ?? new Date();
  const thresholdHours =
    options.thresholdHours ?? DEFAULT_ABANDONED_CHECKOUT_THRESHOLD_HOURS;
  const staleThresholdHours =
    options.staleThresholdHours ?? DEFAULT_STALE_CHECKOUT_THRESHOLD_HOURS;
  const activityAt = getActivityAt(order);
  const ageHours = hoursSince(activityAt, now);
  const rxMode = getRxMode(order);

  if (
    order.archived ||
    order.status !== "draft" ||
    ageHours === null ||
    ageHours < thresholdHours
  ) {
    return {
      isAbandoned: false,
      reasons: [],
      primaryReason: null,
      ageHours,
      activityAt,
      thresholdHours,
      staleThresholdHours,
      rxMode,
    };
  }

  const reasons: AbandonedCheckoutReason[] = [
    order.payment_intent_id
      ? "abandoned_with_payment_intent"
      : "abandoned_no_payment_intent",
  ];

  if (ageHours >= staleThresholdHours) {
    reasons.push("stale_checkout");
  }

  const hasRx = rxMode === "uploaded" || rxMode === "structured_rx";
  if (!hasRx) {
    reasons.push("incomplete_rx");
  }

  if (!hasRx && !hasDoctorInfo(order)) {
    reasons.push("incomplete_doctor_info");
  }

  return {
    isAbandoned: true,
    reasons,
    primaryReason: reasons[0],
    ageHours,
    activityAt,
    thresholdHours,
    staleThresholdHours,
    rxMode,
  };
}

export function summarizeAbandonedReasons(
  classifications: AbandonedCheckoutClassification[],
): Record<AbandonedCheckoutReason, number> {
  const counts: Record<AbandonedCheckoutReason, number> = {
    abandoned_no_payment_intent: 0,
    abandoned_with_payment_intent: 0,
    stale_checkout: 0,
    incomplete_rx: 0,
    incomplete_doctor_info: 0,
  };

  for (const classification of classifications) {
    for (const reason of classification.reasons) {
      counts[reason] += 1;
    }
  }

  return counts;
}
