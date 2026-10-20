import { createHmac, randomBytes } from "node:crypto";

function secret(): string {
  const value = process.env.ORDER_RESUME_TOKEN_SECRET?.trim();
  if (!value) throw new Error("ORDER_RESUME_TOKEN_SECRET is required");
  return value;
}

function digest(purpose: string, value: string): string {
  return createHmac("sha256", secret())
    .update(`honest-lenses-reorder-v1\n${purpose}\n${value}`)
    .digest("hex");
}

export function createReorderEntryToken(orderId: string): string {
  return createHmac("sha256", secret())
    .update(`honest-lenses-reorder-entry-v1\n${orderId}`)
    .digest("base64url");
}

export function createReorderAuthToken(): string {
  return randomBytes(32).toString("base64url");
}

export function isReorderToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export function hashReorderToken(value: string): string {
  return digest("token", value);
}

export function hashReorderEmail(value: string): string {
  return digest("email", value.trim().toLowerCase());
}

export function getReorderEntryUrl(orderId: string, siteUrl?: string): string {
  const base = (siteUrl || process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL ||
    "https://www.honestlenses.com").replace(/\/$/, "");
  return `${base}/reorder/${createReorderEntryToken(orderId)}`;
}

export const REMINDER_ACTIONS = ["postpone_30", "postpone_60", "postpone_90", "custom", "stop"] as const;
export type ReminderAction = typeof REMINDER_ACTIONS[number];

export function createReminderControlToken(orderId: string, action: ReminderAction): string {
  return createHmac("sha256", secret())
    .update(`honest-lenses-reminder-control-v1\n${orderId}\n${action}`)
    .digest("base64url");
}
