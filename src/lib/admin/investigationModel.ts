export type InvestigationMode = "search" | "payment" | "history" | "unmatched" | "date";
export type MatchConfidence = "Confirmed" | "Probable" | "Unmatched";

export type InvestigationInput = {
  mode: InvestigationMode;
  query: string;
  kind: "order" | "intent" | "charge" | "invoice" | "amount" | "date" | "email" | "text";
  amountCents?: number;
  date?: string;
};

export type InvestigationEvent = {
  label: string;
  at: string | null;
  source: "Honest Lenses" | "Stripe";
};

export type InvestigationOrder = {
  id: string;
  number: string | null;
  customer: string;
  email: string | null;
  patient: string | null;
  status: string;
  fulfillment: string | null;
  verificationStatus: string | null;
  sku: string | null;
  quantity: string;
  amountCents: number;
  shipping: string | null;
  paymentIntentId: string | null;
  timeline: InvestigationEvent[];
  url: string;
};

export type InvestigationPayment = {
  id: string;
  kind: "PaymentIntent" | "Charge" | "Invoice";
  amountCents: number;
  currency: string;
  status: string;
  email: string | null;
  createdAt: string;
  paidAt: string | null;
  refundedCents: number;
  intentId: string | null;
  chargeId: string | null;
  invoiceId: string | null;
  orderId: string | null;
  confidence: MatchConfidence;
  reason: string;
  url: string;
  timeline: InvestigationEvent[];
};

export type InvestigationResult = {
  orders: InvestigationOrder[];
  payments: InvestigationPayment[];
  notice: string[];
  limited: boolean;
};

const DAY_MS = 86_400_000;
function chicagoMidnight(day: string): number {
  const target = Date.parse(`${day}T00:00:00Z`);
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit",
    minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  let guess = target + 6 * 60 * 60 * 1000;
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess))
      .map(part => [part.type, part.value]));
    const local = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second));
    guess += target - local;
  }
  return guess;
}
export function centralDayBounds(day: string) {
  const next = new Date(Date.parse(`${day}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
  return { gte: Math.floor(chicagoMidnight(day) / 1000),
    lt: Math.floor(chicagoMidnight(next) / 1000) };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STRIPE_ID = /^(pi|ch|in)_[A-Za-z0-9]{8,}$/;

export function parseInvestigation(query: string, mode: InvestigationMode): InvestigationInput {
  const value = query.trim().slice(0, 120);
  if (!value && mode !== "unmatched") throw new Error("Enter a name, email, ID, amount, or date.");
  if (UUID.test(value) || /^HL-[A-Za-z0-9-]+$/i.test(value))
    return { mode, query: value, kind: "order" };
  const stripeId = value.match(STRIPE_ID);
  if (stripeId) return { mode, query: value,
    kind: stripeId[1] === "pi" ? "intent" : stripeId[1] === "ch" ? "charge" : "invoice" };
  const dateValue = Date.parse(`${value}T00:00:00Z`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(dateValue) &&
      new Date(dateValue).toISOString().slice(0, 10) === value)
    return { mode, query: value, kind: "date", date: value };
  if (mode === "date") throw new Error("Enter a date as YYYY-MM-DD.");
  const amount = value.match(/^\$?(\d{1,7})(?:\.(\d{2}))?$/);
  if (amount) return { mode, query: value, kind: "amount",
    amountCents: Number(amount[1]) * 100 + Number(amount[2] ?? 0) };
  if (value.includes("@") && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
    return { mode, query: value.toLowerCase(), kind: "email" };
  if (value.length < 2 && mode !== "unmatched") throw new Error("Enter at least two characters.");
  return { mode, query: value, kind: "text" };
}

export function linkPaymentToOrder(
  payment: { intentId?: string | null; metadataOrderId?: string | null;
    email?: string | null; amountCents: number },
  orders: Array<{ id: string; paymentIntentId: string | null;
    email: string | null; amountCents: number }>,
): { orderId: string | null; confidence: MatchConfidence; reason: string } {
  const intent = payment.intentId ? orders.find(o => o.paymentIntentId === payment.intentId) : undefined;
  if (intent) return { orderId: intent.id, confidence: "Confirmed", reason: "Exact PaymentIntent ID on order" };
  const metadata = payment.metadataOrderId ? orders.find(o => o.id === payment.metadataOrderId) : undefined;
  if (metadata) return { orderId: metadata.id, confidence: "Confirmed", reason: "Exact order ID in Stripe metadata" };
  const probable = payment.email ? orders.filter(o =>
    o.email?.toLowerCase() === payment.email?.toLowerCase() &&
    o.amountCents === payment.amountCents) : [];
  if (probable?.length === 1) return { orderId: probable[0].id,
    confidence: "Probable", reason: "Same email and amount; no shared payment ID" };
  return { orderId: null, confidence: "Unmatched", reason: "No stable storefront order link found" };
}
