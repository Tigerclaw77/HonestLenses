import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type Stripe from "stripe";
import { buildAdminReceiptEmail, reconcileAdminReceipt } from "./adminReceipt";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-only";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only";
process.env.RESEND_API_KEY = "re_test_only";
process.env.STRIPE_SECRET_KEY = "sk_test_only";
process.env.ORDER_ACCESS_TOKEN_SECRET = "test-only-order-access-secret-0001";
globalThis.fetch = async () => { throw new Error("Real network forbidden in receipt regression tests"); };

const order = { id: "11111111-1111-4111-8111-111111111111", customer_order_number: "HL-2026-123456ABCDEF",
  created_at: "2026-09-01T13:00:00Z", shipping_first_name: "Alex <script>", shipping_last_name: "Customer",
  shipping_email: "customer@example.test", status: "captured", payment_intent_id: "pi_test_only",
  sku: "OASYS_1D_90", right_box_count: 2, left_box_count: 1, total_box_count: 3,
  subtotal_cents: 27897, total_amount_cents: 29497, shipping_cents: 1400, tax_cents: 200,
  capture_amount_cents: 28997, price_reason: "flat_retail_v1", currency: "usd",
  rx: { right: { sphere: -2.5, cyl: -0.75, axis: 90, add: "LOW", base_curve: 8.5, diameter: 14.3 },
    left: { sphere: 0, cylinder: -1.25, axis: 180 } } };
const intent = { id: order.payment_intent_id, status: "succeeded", metadata: { order_id: order.id },
  amount_received: 28997, currency: "usd", latest_charge: { created: 1788271200, refunded: false,
    amount_refunded: 0, disputed: false, payment_method_details: { card: { brand: "visa", last4: "4242" } } } } as unknown as Stripe.PaymentIntent;
const snapshot = reconcileAdminReceipt(order, intent, null);
assert.equal(snapshot.line.totalBoxes, 3);
assert.equal(snapshot.line.unitPriceCents, 9299);
assert.equal(snapshot.adjustmentCents, -500);
assert.equal(snapshot.amountPaidCents, 28997);
const itemized = buildAdminReceiptEmail("itemized", order, snapshot);
for (const text of ["OD (right)", "OS (left)", "Sphere: 0", "Cylinder: -0.75", "Axis: 90", "Add: LOW",
  "Base curve: 8.5", "Diameter: 14.3", "90 lenses/box", "$185.98", "$92.99", "$289.97", "-$5.00",
  "Tax: $2.00", "Shipping: $14.00", "2026-09-01", "customer@example.test", "Payment status: Paid"])
  assert.ok(itemized.text.includes(text), text);
assert.ok(itemized.html.includes("&lt;script&gt;"));
assert.ok(!itemized.html.includes("<script>"));
const sparse = buildAdminReceiptEmail("itemized", { ...order, rx: null, created_at: null }, snapshot);
assert.doesNotMatch(sparse.text, /Sphere:|Cylinder:|Axis:|Add:|Base curve:|Diameter:|Order date:/);
const normal = buildAdminReceiptEmail("receipt", order, snapshot);
assert.match(normal.text, /Total paid: \$289.97/);
assert.match(normal.text, /View Your Order/);
assert.doesNotMatch(normal.text, /awaiting|will contact your doctor|Sphere/);
assert.throws(() => reconcileAdminReceipt(order, { ...intent, amount_received: 29497 }, null), /final amount/);
assert.throws(() => reconcileAdminReceipt({ ...order, subtotal_cents: 12 }, intent, null), /reconcile/);
assert.throws(() => reconcileAdminReceipt(order, { ...intent, status: "requires_capture" }, null), /captured payment/);
assert.throws(() => reconcileAdminReceipt(order, { ...intent, metadata: { order_id: "wrong" } }, null), /belonging/);
assert.throws(() => reconcileAdminReceipt(order, intent, { ...snapshot, amountPaidCents: 1 }), /differ/);
assert.throws(() => reconcileAdminReceipt({ ...order, shipping_email: "invalid" }, intent, null), /email/);
assert.throws(() => reconcileAdminReceipt(order, { ...intent, latest_charge: { ...intent.latest_charge as Stripe.Charge, amount_refunded: 100 } }, null), /refunded/);
const reordered = { ...snapshot, line: Object.fromEntries(Object.entries(snapshot.line).reverse()) } as typeof snapshot;
assert.deepEqual(reconcileAdminReceipt(order, intent, reordered), snapshot);
const adjustedOrder = { ...order, adjusted_right_box_count: 1, adjusted_left_box_count: 1,
  adjusted_total_box_count: 2, subtotal_cents: 18598, total_amount_cents: 20198, capture_amount_cents: 19698 };
const adjusted = reconcileAdminReceipt(adjustedOrder, { ...intent, amount_received: 19698 }, null);
assert.deepEqual([adjusted.line.rightBoxes, adjusted.line.leftBoxes, adjusted.line.lineTotalCents, adjusted.amountPaidCents],
  [1, 1, 18598, 19698]);
const oneEyeOrder = { ...order, right_box_count: 1, left_box_count: 0, total_box_count: 1,
  subtotal_cents: 9299, total_amount_cents: 10899, capture_amount_cents: 10899 };
const oneEye = reconcileAdminReceipt(oneEyeOrder, { ...intent, amount_received: 10899 }, null);
assert.doesNotMatch(buildAdminReceiptEmail("itemized", oneEyeOrder, oneEye).text, /OS \(left\)/);

async function main() {
  const { sendAdminReceipt, adminReceiptDependencies } = await import("./adminReceiptServer");
  const { EmailSendError } = await import("@/lib/email");
  assert.equal(new EmailSendError(500).definitivelyRejected, false);
  assert.equal(new EmailSendError(null).definitivelyRejected, false);
  assert.equal(new EmailSendError(409).definitivelyRejected, false);
  let sends = 0;
  let claimed = false;
  let failure = "";
  let auditFailure = false;
  const events: Record<string, unknown>[] = [];
  const original = JSON.stringify(order);
  const db = {
    from(table: string) {
      assert.ok(["orders", "order_receipt_snapshots", "order_events"].includes(table));
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: table === "orders" ? order : { snapshot }, error: null }),
        insert: async (event: Record<string, unknown>) => {
          assert.equal(table, "order_events", "Only audit inserts permitted");
          events.push(event); return { error: auditFailure ? { message: "offline" } : null };
        } };
      return q;
    },
    rpc: async (name: string) => { assert.equal(name, "claim_admin_receipt_send");
      const wasClaimed = claimed; claimed = true; return { data: { claimed: !wasClaimed }, error: null }; },
  } as unknown as typeof adminReceiptDependencies.db;
  const deps = { db, stripe: () => ({ paymentIntents: { retrieve: async () => intent } }) as unknown as Stripe,
    send: async (params: Parameters<typeof adminReceiptDependencies.send>[0]) => {
      sends++; assert.equal(params.to, order.shipping_email); assert.equal(params.tracking?.updateOrderSummary, false);
      assert.match(params.idempotencyKey!, /admin-receipt:/);
      if (failure) throw failure === "Email send failed" ? new EmailSendError(422) : new Error(failure);
      return { data: { id: "email_test" }, error: null } as Awaited<ReturnType<typeof adminReceiptDependencies.send>>;
    } };
  const results = await Promise.all([1, 2].map(() => sendAdminReceipt(order.id, "receipt", "request", "admin", deps)));
  assert.equal(sends, 1); assert.equal(results.filter(r => r.ok).length, 1);
  assert.equal(events[0].event_type, "admin_receipt_sent");
  claimed = false;
  assert.equal((await sendAdminReceipt(order.id, "itemized", "itemized", "admin", deps)).ok, true);
  claimed = false; failure = "Email send failed";
  assert.equal((await sendAdminReceipt(order.id, "receipt", "failed", "admin", deps)).ok, false);
  assert.equal(events.at(-1)?.event_type, "admin_receipt_failed");
  claimed = false; failure = "network timeout";
  assert.equal((await sendAdminReceipt(order.id, "receipt", "uncertain", "admin", deps)).ok, false);
  assert.equal(events.at(-1)?.event_type, "admin_receipt_unknown");
  claimed = false; failure = ""; auditFailure = true;
  const auditResult = await sendAdminReceipt(order.id, "receipt", "audit-failed", "admin", deps);
  assert.equal(auditResult.ok, true); assert.match(auditResult.warning!, /audit failed/);
  assert.equal(JSON.stringify(order), original, "Order and Rx must remain unchanged");

  let providerCalls = 0, ledgerCalls = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body));
    if (url === "https://api.resend.com/emails") {
      providerCalls++;
      assert.equal(body.from, "Honest Lenses <support@honestlenses.com>");
      assert.equal(body.to, order.shipping_email);
      assert.match(body.html, /Itemized receipt/);
      return Response.json({ id: "email_mocked_provider" });
    }
    assert.match(url, /\/rest\/v1\/order_email_deliveries\?/);
    assert.equal(body.resend_email_id, "email_mocked_provider");
    ledgerCalls++;
    return new Response(null, { status: 201 });
  };
  claimed = false; auditFailure = false;
  assert.equal((await sendAdminReceipt(order.id, "itemized", "provider", "admin",
    { ...deps, send: adminReceiptDependencies.send })).ok, true);
  assert.equal(providerCalls, 1); assert.equal(ledgerCalls, 1);

  const { POST, GET } = await import("@/app/api/admin/orders/[id]/receipts/route");
  const context = { params: Promise.resolve({ id: order.id }) };
  for (const handler of [POST, GET]) {
    const result = await handler(new Request("https://example.test/api/admin/orders/id/receipts", {
      method: handler === POST ? "POST" : "GET", headers: { Authorization: "invalid" } }), context);
    assert.equal(result.status, 401);
  }
  // The real authorization helper must reject a valid non-admin identity before any order access.
  globalThis.fetch = async input => {
    assert.match(String(input), /\/auth\/v1\/user$/);
    return Response.json({ id: order.id, email: "customer@example.test", app_metadata: {}, user_metadata: { role: "admin" } });
  };
  assert.equal((await POST(new Request("https://example.test/api/admin/orders/id/receipts", {
    method: "POST", headers: { Authorization: "Bearer test-only" }, body: "{}" }), context)).status, 403);
  const ui = readFileSync("src/app/admin/orders/ReceiptActions.tsx", "utf8");
  assert.match(ui, /window.confirm/); assert.match(ui, /if \(sending.current\) return/);
  assert.match(ui, /disabled=\{busy/); assert.match(ui, /Last sent:/);
  console.log("Admin receipt regression tests passed: reconciliation, content, sends, failures, audit, concurrency, authorization, and no business-state mutation.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
