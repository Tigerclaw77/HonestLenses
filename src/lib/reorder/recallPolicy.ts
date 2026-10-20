const DAY = 86_400_000;
export const RECALL_COOLDOWN_DAYS = 30;

export type RecallKind = "replenishment" | "expiration" | "combined";

/** The prospective launch is Texas-only; all other jurisdictions stay held. */
export function requiresJurisdictionReview(state: string | null | undefined): boolean {
  const normalized = (state ?? "").trim().toUpperCase();
  return normalized !== "TX" && normalized !== "TEXAS";
}

/** A self-patient declaration is accepted only when the order names agree. */
export function sameNamedRecipientAndPatient(order: {
  shipping_first_name?: string | null; shipping_last_name?: string | null;
  patient_first_name?: string | null; patient_last_name?: string | null;
}): boolean {
  const normalize = (name: string | null | undefined) =>
    (name ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
  const shippingFirst = normalize(order.shipping_first_name);
  const shippingLast = normalize(order.shipping_last_name);
  return Boolean(shippingFirst && shippingLast &&
    shippingFirst === normalize(order.patient_first_name) &&
    shippingLast === normalize(order.patient_last_name));
}

export function documentedExpiration(order: {
  rx?: unknown; rx_expiration_date?: string | null;
  verification_status?: string | null; verification_passed?: boolean | null;
  verification_completed_at?: string | null; patient_first_name?: string | null;
  patient_last_name?: string | null; patient_dob?: string | null;
  rx_patient_name?: string | null; rx_dob?: string | null;
}, now = Date.now()): string | null {
  const rx = order.rx && typeof order.rx === "object" ? order.rx as { expires?: unknown } : null;
  const date = rx?.expires;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      (order.rx_expiration_date && order.rx_expiration_date !== date) ||
      !["verified", "auto_verified"].includes(order.verification_status ?? "") ||
      order.verification_passed !== true || !order.verification_completed_at ||
      !order.patient_first_name || !order.patient_last_name || !order.patient_dob ||
      (order.rx_dob && order.rx_dob !== order.patient_dob) ||
      (order.rx_patient_name && !order.rx_patient_name.toLowerCase().includes(order.patient_last_name.toLowerCase()))) return null;
  const end = Date.parse(`${date}T23:59:59.999Z`);
  return Number.isFinite(end) && end > now ? date : null;
}

export function expirationReminderAt(expiration: string, now = Date.now()): string | null {
  const due = Date.parse(`${expiration}T12:00:00Z`) - 45 * DAY;
  // Do not create a catch-up campaign for old orders or already-due alerts.
  return Number.isFinite(due) && due > now ? new Date(due).toISOString() : null;
}

export function nextEligibleAt(lastClaimedAt: string | null | undefined): string | null {
  const at = lastClaimedAt ? Date.parse(lastClaimedAt) : NaN;
  return Number.isFinite(at) ? new Date(at + RECALL_COOLDOWN_DAYS * DAY).toISOString() : null;
}

export function chooseRecall(input: {
  replenishmentAt?: string | null; expirationAt?: string | null;
  expirationDate?: string | null; now?: number; dueBy?: number;
}): { kind: RecallKind; scheduledFor: string } | null {
  const now = input.now ?? Date.now();
  const dueBy = input.dueBy ?? now;
  const replenish = input.replenishmentAt ? Date.parse(input.replenishmentAt) : NaN;
  const expire = input.expirationAt ? Date.parse(input.expirationAt) : NaN;
  const replenishDue = Number.isFinite(replenish) && replenish <= dueBy;
  const expireDue = Number.isFinite(expire) && expire <= dueBy;
  if (!replenishDue && !expireDue) return null;
  const expiry = input.expirationDate ? Date.parse(`${input.expirationDate}T23:59:59.999Z`) : NaN;
  const timely = Number.isFinite(expiry) && expiry > now && expiry <= now + 75 * DAY;
  const near = Number.isFinite(replenish) && Number.isFinite(expire) &&
    Math.abs(replenish - expire) < RECALL_COOLDOWN_DAYS * DAY;
  if (timely && near) return { kind: "combined", scheduledFor: new Date(Math.min(replenish, expire)).toISOString() };
  if (expireDue && timely) return { kind: "expiration", scheduledFor: input.expirationAt! };
  if (replenishDue) return { kind: "replenishment", scheduledFor: input.replenishmentAt! };
  return null;
}

export type SuppressionReason = "opted_out" | "bounced" | "recent_purchase" |
  "no_lawful_basis" | "explicitly_declined" |
  "unverified_patient_authority" | "jurisdiction_review" |
  "manual_invoice_purchase" |
  "pending_reorder" | "newer_order" | "inactive_order" | "synthetic_test" |
  "unreliable_prescription" | "cooldown" | "refunded_or_unverified_payment" |
  "delivery_review";

export function suppressionReason(input: {
  optedOut?: boolean; bounced?: boolean; recentPurchase?: boolean;
  pendingReorder?: boolean; newerOrder?: boolean; captured?: boolean;
  synthetic?: boolean; expirationOnly?: boolean; documentedExpiration?: boolean;
  lastClaimedAt?: string | null; claimStatus?: string | null;
  now?: number; paymentValid?: boolean;
}): SuppressionReason | null {
  if (input.optedOut) return "opted_out";
  if (input.bounced) return "bounced";
  if (input.synthetic) return "synthetic_test";
  if (!input.captured) return "inactive_order";
  if (!input.paymentValid) return "refunded_or_unverified_payment";
  if (input.pendingReorder) return "pending_reorder";
  if (input.recentPurchase) return "recent_purchase";
  if (input.newerOrder) return "newer_order";
  if (input.expirationOnly && !input.documentedExpiration) return "unreliable_prescription";
  if (input.claimStatus && input.claimStatus !== "accepted") return "delivery_review";
  const next = nextEligibleAt(input.lastClaimedAt);
  if (next && Date.parse(next) > (input.now ?? Date.now())) return "cooldown";
  return null;
}
