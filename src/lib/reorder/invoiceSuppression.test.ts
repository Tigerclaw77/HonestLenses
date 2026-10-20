import assert from "node:assert/strict";
import type Stripe from "stripe";
import { hasConfirmedManualInvoicePurchase, invoiceBelongsToSource,
  invoiceIsRecentPaidPurchase } from "./invoiceSuppression";

const now = Date.parse("2026-10-20T12:00:00Z");
const source = { orderId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  sourceIntentId: "pi_source", customerId: "cus_verified",
  email: "verified@example.test",
  createdAt: "2026-09-20T12:00:00Z" };
const invoice = { id: "in_manual", customer: "cus_verified", customer_email: "VERIFIED@example.test",
  metadata: {}, status: "paid", amount_paid: 10199,
  status_transitions: { paid_at: Math.floor(now / 1000) - 3600 } } as unknown as Stripe.Invoice;
assert.equal(invoiceBelongsToSource(invoice, source), true);
assert.equal(invoiceBelongsToSource({ ...invoice, customer_email: "other@example.test" }, source),
  false, "Shared Stripe Customer IDs cannot merge different email recipients");
assert.equal(invoiceBelongsToSource({ ...invoice, customer: "cus_unrelated",
  customer_email: "same@example.test" }, source), false, "Email alone cannot link accounts");
assert.equal(invoiceBelongsToSource({ ...invoice, customer: "cus_unrelated",
  metadata: { source_order_id: source.orderId } }, { ...source, customerId: null }), true);
assert.equal(invoiceIsRecentPaidPurchase(invoice, source.createdAt, now), true);
assert.equal(invoiceIsRecentPaidPurchase({ ...invoice, status: "open" }, source.createdAt, now), false);
assert.equal(invoiceIsRecentPaidPurchase({ ...invoice, amount_paid: 0 }, source.createdAt, now), false);
assert.equal(invoiceIsRecentPaidPurchase({ ...invoice,
  status_transitions: { ...invoice.status_transitions,
    paid_at: Math.floor(now / 1000) - 31 * 86_400 } }, source.createdAt, now), false);

async function check(options: { customer?: string; email?: string; refunded?: number; sourceInvoice?: boolean;
  status?: string; hasMore?: boolean } = {}) {
  const linked = { ...invoice, customer: options.customer ?? invoice.customer,
    customer_email: options.email ?? invoice.customer_email,
    status: options.status ?? invoice.status };
  const stripe = {
    invoices: {
      list: async () => ({ data: [linked], has_more: options.hasMore ?? false }),
      search: async () => ({ data: [], has_more: false }),
    },
    invoicePayments: { list: async (args: { invoice?: string }) => args.invoice
      ? { data: [{ payment: { payment_intent: "pi_manual" } }], has_more: false }
      : { data: options.sourceInvoice ? [{ invoice: linked.id }] : [], has_more: false } },
    paymentIntents: { retrieve: async () => ({ status: "succeeded", amount_received: 10199,
      latest_charge: { captured: true, amount_refunded: options.refunded ?? 0, disputed: false } }) },
  } as unknown as Stripe;
  return hasConfirmedManualInvoicePurchase(stripe, source, now);
}

async function main() {
  assert.equal(await check(), true);
  assert.equal(await check({ customer: "cus_unrelated" }), false);
  assert.equal(await check({ email: "other@example.test" }), false);
  assert.equal(await check({ refunded: 10199 }), false);
  assert.equal(await check({ sourceInvoice: true }), false);
  assert.equal(await check({ status: "open" }), false);
  await assert.rejects(check({ hasMore: true }), /incomplete/);
  console.log("Confirmed manual invoice suppression and unrelated-customer guards passed.");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
