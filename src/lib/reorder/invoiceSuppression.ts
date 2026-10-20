import type Stripe from "stripe";

const DAY = 86_400;

function reference(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id ?? null;
}

export function invoiceBelongsToSource(invoice: Stripe.Invoice, source: {
  orderId: string; customerId: string | null; email: string;
}): boolean {
  const sameEmail = invoice.customer_email?.trim().toLowerCase() ===
    source.email.trim().toLowerCase();
  return Boolean((source.customerId && sameEmail &&
    reference(invoice.customer) === source.customerId) ||
    invoice.metadata?.source_order_id === source.orderId ||
    invoice.metadata?.order_id === source.orderId);
}

export function invoiceIsRecentPaidPurchase(invoice: Stripe.Invoice,
  sourceCreatedAt: string, now: number): boolean {
  const paidAt = invoice.status_transitions?.paid_at;
  return invoice.status === "paid" && invoice.amount_paid > 0 &&
    typeof paidAt === "number" && paidAt * 1000 > Date.parse(sourceCreatedAt) &&
    paidAt * 1000 >= now - 30 * DAY * 1000 && paidAt * 1000 <= now;
}

async function capturedUnrefundedPayment(stripe: Stripe, invoiceId: string): Promise<boolean> {
  const payments = await stripe.invoicePayments.list({ invoice: invoiceId, limit: 100 });
  if (payments.has_more) throw new Error("Invoice payment list incomplete");
  for (const item of payments.data) {
    const payment = item.payment as {
      payment_intent?: string | { id: string } | null;
      charge?: string | { id: string } | null;
    } | null;
    const intentId = reference(payment?.payment_intent);
    const chargeId = reference(payment?.charge);
    if (intentId) {
      const intent = await stripe.paymentIntents.retrieve(intentId, { expand: ["latest_charge"] });
      const charge = intent.latest_charge;
      if (intent.status === "succeeded" && intent.amount_received > 0 &&
          charge && typeof charge !== "string" && charge.captured &&
          charge.amount_refunded === 0 && !charge.disputed) return true;
    } else if (chargeId) {
      const charge = await stripe.charges.retrieve(chargeId);
      if (charge.paid && charge.captured && charge.amount_refunded === 0 &&
          !charge.disputed) return true;
    }
  }
  return false;
}

/** Only a captured Stripe payment with a stable source relationship suppresses recall. */
export async function hasConfirmedManualInvoicePurchase(stripe: Stripe, source: {
  orderId: string; sourceIntentId: string; customerId: string | null;
  email: string; createdAt: string;
}, now = Date.now()): Promise<boolean> {
  const candidates = new Map<string, Stripe.Invoice>();
  if (source.customerId) {
    const listed = await stripe.invoices.list({ customer: source.customerId,
      status: "paid", limit: 100 });
    if (listed.has_more) throw new Error("Customer invoice list incomplete");
    for (const invoice of listed.data) candidates.set(invoice.id, invoice);
  }
  // An explicit source-order reference also covers storefront intents without a Customer.
  const linked = await stripe.invoices.search({
    query: `metadata['source_order_id']:'${source.orderId}'`, limit: 100,
  });
  if (linked.has_more) throw new Error("Linked invoice search incomplete");
  for (const invoice of linked.data) candidates.set(invoice.id, invoice);
  if (!candidates.size) return false;
  const original = await stripe.invoicePayments.list({
    payment: { type: "payment_intent", payment_intent: source.sourceIntentId }, limit: 100,
  });
  if (original.has_more) throw new Error("Source invoice payment lookup incomplete");
  const sourceInvoiceIds = new Set(original.data.map(item => reference(item.invoice)));
  for (const invoice of candidates.values()) {
    if (!invoiceBelongsToSource(invoice, source) ||
        !invoiceIsRecentPaidPurchase(invoice, source.createdAt, now) ||
        sourceInvoiceIds.has(invoice.id)) continue;
    if (await capturedUnrefundedPayment(stripe, invoice.id)) return true;
  }
  return false;
}
