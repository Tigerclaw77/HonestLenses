import {
  isLikelyEmail,
  normalizeRecoveryEmail,
  getResumeDestination,
  type RecoverableOrder,
} from "@/lib/order-recovery";
import { projectPaymentState } from "@/lib/orders/paymentState";
import type { AbandonedCheckoutClassification } from "@/lib/ops/abandonedCheckout";

export const MANUAL_RECOVERY_CUTOFF = "2026-09-05T00:00:00.000Z";

export type ManualRecoveryLedgerRow = {
  state?: string | null;
  sent_at?: string | null;
  ignored_at?: string | null;
};

export type ManualRecoveryReview = {
  state: "unresolved" | "sent" | "ignored";
  sentAt: string | null;
  ignoredAt: string | null;
};

type ManualRecoveryOrder = Omit<RecoverableOrder, "status"> & {
  status?: string | null;
  created_at?: string | null;
  email_delivery_status?: string | null;
};

const UNUSABLE_DELIVERY_STATES = new Set([
  "bounced",
  "complained",
  "suppressed",
  "failed",
]);

export function hasUsableRecoveryEmail(order: ManualRecoveryOrder): boolean {
  const email = normalizeRecoveryEmail(order.shipping_email ?? "");
  return (
    isLikelyEmail(email) &&
    !UNUSABLE_DELIVERY_STATES.has(
      order.email_delivery_status?.trim().toLowerCase() ?? "",
    )
  );
}

export function isManualRecoveryCandidate(
  order: ManualRecoveryOrder,
  abandoned: AbandonedCheckoutClassification,
): boolean {
  const createdAt = Date.parse(order.created_at ?? "");
  if (
    !Number.isFinite(createdAt) ||
    createdAt < Date.parse(MANUAL_RECOVERY_CUTOFF) ||
    !hasUsableRecoveryEmail(order) ||
    !abandoned.isAbandoned
  ) {
    return false;
  }

  const payment = projectPaymentState(order, { fallback: "strict" });
  if (payment.status !== "draft") return false;

  return Boolean(
    getResumeDestination({
      ...order,
      status: order.status ?? null,
      payment_status: "draft",
    }),
  );
}

export function getManualRecoveryReview(
  order: ManualRecoveryOrder,
  abandoned: AbandonedCheckoutClassification,
  ledger: ManualRecoveryLedgerRow[] = [],
): ManualRecoveryReview | null {
  if (!isManualRecoveryCandidate(order, abandoned)) return null;

  const sent = ledger.find((row) => row.state === "sent");
  if (sent) {
    return { state: "sent", sentAt: sent.sent_at ?? null, ignoredAt: null };
  }

  const ignored = ledger.find((row) => row.state === "ignored");
  if (ignored) {
    return {
      state: "ignored",
      sentAt: null,
      ignoredAt: ignored.ignored_at ?? null,
    };
  }

  return { state: "unresolved", sentAt: null, ignoredAt: null };
}
