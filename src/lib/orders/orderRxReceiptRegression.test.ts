import assert from "node:assert/strict";
import type Stripe from "stripe";
import { lenses } from "@/LensCore";
import { resolveBrand } from "@/lib/resolveBrand";
import { evaluateUploadedRxAutomation, runUploadedRxAutomation } from "./uploadedRxAutomation";
import { hasUnresolvedProductMismatch } from "./productSelection";
import { getAuthoritativeOrderQuote } from "./orderPricing";
import { assessAdminFulfillmentTransition } from "./adminWorkflow";
import { buildReceiptSnapshot, receiptMerchandiseSubtotal } from "@/lib/receipts/core";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.STRIPE_SECRET_KEY = "sk_test_unit_only";
process.env.RESEND_API_KEY = "re_unit_only";

const eye = { coreId: "OASYS_1D", sphere: -4.25, base_curve: 8.5, diameter: 14.3 };
const ocrEye = { sphere: -4.25, baseCurve: 8.5, diameter: 14.3, cylinder: null,
  axis: null, add: null, brand_raw: "Acuvue Oasys 1-Day" };
const order = {
  id: "00000000-0000-4000-8000-000000000001", status: "authorized",
  customer_order_number: "HL-2026-123456ABCDEF", payment_intent_id: "pi_unit_only",
  sku: "OASYS_1D_90", right_box_count: 1, left_box_count: 1, total_box_count: 2, box_count: 2,
  total_amount_cents: 19998, subtotal_cents: 0, shipping_cents: 1400, tax_cents: 0,
  shipping_method: "standard", price_reason: "flat_retail_v1", currency: "usd",
  shipping_email: "customer@example.test", rx_upload_path: "synthetic/upload.jpg",
  rx_status: "uploaded_customer_confirmed", rx: { right: eye, left: eye, expires: "2027-08-28" },
  rx_ocr_raw: { right: ocrEye, left: ocrEye, expirationDate: "2027-08-28",
    brand_raw: "Acuvue Oasys 1-Day", confidence: 1, looks_like_contact_lens_rx: true,
    notes: "Contact lens prescription section clearly identified. No cylinder, axis, or add values present for contact lenses." },
};
const now = new Date("2026-09-05T22:35:54Z");
const initialQuote = getAuthoritativeOrderQuote({ sku: "OASYS_2W_24", totalBoxes: 2, rightBoxCount: 1, leftBoxCount: 1 });
const finalQuote = getAuthoritativeOrderQuote({ sku: order.sku, totalBoxes: 2, rightBoxCount: 1, leftBoxCount: 1 });
assert.deepEqual([initialQuote.pricePerBoxCents, initialQuote.shippingCents, initialQuote.totalAmountCents], [13799, 0, 27598]);
assert.deepEqual([finalQuote.pricePerBoxCents, finalQuote.shippingCents, finalQuote.totalAmountCents], [9299, 1400, 19998]);
assert.equal(initialQuote.totalAmountCents - finalQuote.totalAmountCents, 7600);
assert.equal(resolveBrand({ rawString: ocrEye.brand_raw, bc: 8.5, dia: 14.3 }, lenses).lensId, "OASYS_1D");
assert.equal(resolveBrand({ rawString: "ACUVUE OASYS MAX 1-Day", bc: 8.5, dia: 14.3 }, lenses).lensId, "OASYS_MAX_1D");
assert.equal(resolveBrand({ rawString: ocrEye.brand_raw, bc: 8.5, dia: 14.5 }, lenses).lensId, null);
assert.equal(evaluateUploadedRxAutomation(order, "requires_capture", now).autoVerify, true);

const mismatch = { ...order, sku: "OASYS_MAX_1D_90", rx: { ...order.rx,
  right: { ...eye, coreId: "OASYS_MAX_1D" }, left: { ...eye, coreId: "OASYS_MAX_1D" } } };
assert.equal(evaluateUploadedRxAutomation(mismatch, "requires_capture", now).reason, "product_mismatch");
const overwritten = { ...order, rx_ocr_meta: { selected_product: {
  sku: "OASYS_MAX_1D_90", right: "OASYS_MAX_1D", left: "OASYS_MAX_1D" } } };
assert.equal(hasUnresolvedProductMismatch(overwritten), true, "Even an overwritten current product cannot erase the original selection");
for (const target of ["ready_to_order", "ordered", "shipped", "completed"]) {
  assert.equal(assessAdminFulfillmentTransition({ ...overwritten, status: "captured", verification_status: "verified" }, target).allowed, false);
}
const resolved = { ...overwritten, rx_ocr_meta: { ...overwritten.rx_ocr_meta,
  product_resolution: { action: "accept_prescribed_product", upload_path: order.rx_upload_path,
    right: "OASYS_1D", left: "OASYS_1D" } } };
assert.equal(hasUnresolvedProductMismatch(resolved), false);
assert.equal(hasUnresolvedProductMismatch({ ...resolved, rx_upload_path: "new-upload" }), true);

assert.equal(receiptMerchandiseSubtotal(order), 18598);
const payment = { amountReceivedCents: 19998, currency: "usd", capturedAt: "2026-09-05T22:53:25Z" };
assert.equal(buildReceiptSnapshot(order, payment).line.lineTotalCents, 18598);
assert.throws(() => buildReceiptSnapshot({ ...order, subtotal_cents: 27598 }, payment), /reconcile/);
assert.throws(() => buildReceiptSnapshot(order, { ...payment, amountReceivedCents: 19000 }), /approved final amount/);
const discount = buildReceiptSnapshot({ ...order, capture_amount_cents: 19498 }, { ...payment, amountReceivedCents: 19498 });
assert.equal(discount.adjustmentCents, -500);

async function main() {
  let calls = 0;
  await runUploadedRxAutomation(mismatch, "requires_capture", async () => {
    calls++; return { paymentIntentId: "pi_unit_only", alreadyCaptured: false };
  }, now);
  assert.equal(calls, 0);
  const { captureAuthorizedOrderPayment } = await import("@/lib/payments/legacyPaymentCommands");
  const steps: string[] = [];
  let captured = false;
  const stripe = { paymentIntents: {
    retrieve: async () => ({ id: order.payment_intent_id, status: captured ? "succeeded" : "requires_capture",
      capture_method: "manual", currency: "usd", metadata: { order_id: order.id },
      amount: 27598, amount_capturable: captured ? 0 : 27598, amount_received: captured ? 19998 : 0,
      receipt_email: null }),
    update: async (_id: string, p: Stripe.PaymentIntentUpdateParams) => { steps.push(`email:${p.receipt_email}`); },
    capture: async (_id: string, p: Stripe.PaymentIntentCaptureParams) => { steps.push(`capture:${p.amount_to_capture}`); captured = true; },
  } };
  const dependencies = { stripe: stripe as never, loadOrder: async () => order,
    persistSubtotal: async (_order: unknown, subtotal: number) => { steps.push(`subtotal:${subtotal}`); },
    createReceiptSnapshot: async () => { steps.push("snapshot"); return true; } };
  // Also covers a true price decrease AFTER authorization, beyond the incident's pre-auth decrease.
  await captureAuthorizedOrderPayment({ id: order.id }, "uploaded-rx-automation", dependencies);
  assert.deepEqual(steps, ["subtotal:18598", "email:customer@example.test", "capture:19998", "snapshot"]);
  await captureAuthorizedOrderPayment({ id: order.id }, "uploaded-rx-automation", dependencies);
  assert.equal(steps.filter(s => s.startsWith("capture:")).length, 1, "Replay never captures twice");
  captured = false;
  steps.length = 0;
  await assert.rejects(captureAuthorizedOrderPayment({ id: order.id }, "admin-operator", {
    ...dependencies, loadOrder: async () => overwritten,
  }), /Product mismatch/);
  assert.deepEqual(steps, []);
  await assert.rejects(captureAuthorizedOrderPayment({ id: order.id }, "admin-operator", {
    ...dependencies, persistSubtotal: async () => { throw new Error("database unavailable"); },
  }), /database unavailable/);
  assert.deepEqual(steps, [], "Persistence failure prevents capture");
  console.log("Order Rx, product mismatch, price decrease, and receipt regression tests passed.");
}
void main().catch(e => { console.error(e); process.exitCode = 1; });
