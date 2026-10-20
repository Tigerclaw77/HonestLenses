import assert from "node:assert/strict";
import { centralDayBounds, groupInvoicePayments, linkPaymentToOrder, netPaid, orderPrimaryAmount,
  parseInvestigation, paymentCategory, type InvestigationPayment } from "./investigationModel";

assert.equal(parseInvestigation("Victoria West", "history").kind, "text");
assert.equal(parseInvestigation("victoria@example.com", "history").kind, "email");
assert.equal(parseInvestigation("7c5feaee-d5fd-42f3-835a-542c470888bd", "search").kind, "order");
assert.equal(parseInvestigation("HL-2026-ABC123", "search").kind, "order");
assert.equal(parseInvestigation("pi_123456789", "payment").kind, "intent");
assert.equal(parseInvestigation("ch_123456789", "payment").kind, "charge");
assert.equal(parseInvestigation("in_123456789", "payment").kind, "invoice");
assert.equal(parseInvestigation("$101.99", "payment").amountCents, 10199);
assert.equal(parseInvestigation("2026-10-18", "date").kind, "date");
assert.throws(() => parseInvestigation("2026-02-30", "date"));
assert.equal(new Date(centralDayBounds("2026-10-18").gte * 1000).toISOString(),
  "2026-10-18T05:00:00.000Z");
assert.equal(centralDayBounds("2026-11-01").lt - centralDayBounds("2026-11-01").gte,
  25 * 60 * 60);
assert.throws(() => parseInvestigation("", "search"));

const orders = [{ id: "order-one", paymentIntentId: "pi_exact", email: "victoria@example.com",
  amountCents: 10199 }];
assert.deepEqual(linkPaymentToOrder({ intentId: "pi_exact", amountCents: 9999,
  email: "other@example.com" }, orders), { orderId: "order-one", confidence: "Confirmed",
  reason: "Exact PaymentIntent ID on order" });
assert.deepEqual(linkPaymentToOrder({ metadataOrderId: "order-one", amountCents: 9999 }, orders),
  { orderId: "order-one", confidence: "Confirmed", reason: "Exact order ID in Stripe metadata" });
assert.equal(linkPaymentToOrder({ email: "victoria@example.com", amountCents: 10199 }, orders)
  .confidence, "Probable");
assert.equal(linkPaymentToOrder({ email: "victoria@example.com", amountCents: 10199 },
  [...orders, { ...orders[0], id: "order-two" }]).confidence, "Unmatched");
assert.equal(linkPaymentToOrder({ email: "victoria@example.com", amountCents: 10200 }, orders)
  .confidence, "Unmatched");
assert.equal(paymentCategory("Invoice", { confidence: "Unmatched" }, "paid"), "MANUAL STRIPE PAYMENT");
assert.equal(paymentCategory("Invoice", { confidence: "Probable" }, "paid"), "MANUAL STRIPE PAYMENT");
assert.equal(paymentCategory("Invoice", { confidence: "Unmatched" }, "draft"), "NEEDS INVESTIGATION");
assert.equal(paymentCategory("PaymentIntent", { confidence: "Unmatched" }), "NEEDS INVESTIGATION");
assert.equal(paymentCategory("PaymentIntent", { confidence: "Confirmed" }), "LINKED TO ORDER");
assert.equal(netPaid(10199, 0), 10199);
assert.equal(netPaid(10199, 2000), 8199);
assert.equal(netPaid(null, 0), null);
const invoice = { id: "in_test", kind: "Invoice", intentId: "pi_test",
  relatedIntentIds: ["pi_test"], relatedChargeIds: ["ch_test"],
  amountCents: 10199, capturedCents: 10199, authorizedCents: 10199,
  netPaidCents: 10199, category: "MANUAL STRIPE PAYMENT" } as InvestigationPayment;
const intent = { ...invoice, id: "pi_test", kind: "PaymentIntent" } as InvestigationPayment;
assert.deepEqual(groupInvoicePayments([invoice, intent]), [invoice]);
assert.equal(groupInvoicePayments([intent]).length, 1);
assert.equal(groupInvoicePayments([{ ...invoice, relatedIntentIds: ["pi_test", "pi_second"] },
  intent, { ...intent, id: "pi_second" }]).length, 1);
assert.equal(groupInvoicePayments([invoice, { ...intent, id: "ch_test", kind: "Charge" }]).length, 1);
const historical = { amountCents: 35996, capturedCents: 10199,
  authorizedCents: 35996, netPaidCents: netPaid(10199, 0), status: "captured" };
assert.equal(orderPrimaryAmount(historical), 10199);
assert.equal(orderPrimaryAmount({ ...historical, capturedCents: null,
  netPaidCents: null }), null);
assert.notEqual(historical.amountCents, historical.capturedCents);
console.log("Investigation classification and conservative reconciliation passed.");
