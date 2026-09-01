import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type Stripe from "stripe";
import {
  buildReceiptSnapshot,
  createRandomReceiptToken,
  createStableReceiptToken,
  getReceiptExpiry,
  hashReceiptToken,
  isCustomerOrderNumber,
  isHistoricalOrderUuid,
  isReceiptTokenActive,
  receiptEmailsMatch,
  receiptSnapshotContainsProhibitedData,
} from "./core";
import { buildReceiptAccessEmail } from "@/lib/email/receiptAccessEmail";

process.env.RECEIPT_TOKEN_SECRET = "receipt-test-secret-with-at-least-32-bytes";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.STRIPE_SECRET_KEY = "sk_test_receipt_unit_test";
process.env.RESEND_API_KEY = "re_test_receipt_unit_test";

const token = createRandomReceiptToken();
assert.match(token, /^[A-Za-z0-9_-]{40,100}$/);
assert.notEqual(hashReceiptToken(token), token);
assert.notEqual(createRandomReceiptToken(), token);

const now = Date.UTC(2026, 8, 1);
const expiresAt = getReceiptExpiry(60, now);
const stable = createStableReceiptToken(
  "6b4f7274-4fe2-403b-a95a-342148e294be",
  "confirmation",
  expiresAt,
);
assert.equal(
  stable,
  createStableReceiptToken(
    "6b4f7274-4fe2-403b-a95a-342148e294be",
    "confirmation",
    expiresAt,
  ),
);
assert.equal(isReceiptTokenActive(expiresAt, null, now), true);
assert.equal(isReceiptTokenActive(expiresAt, null, now + 3_600_001), false);
assert.equal(isReceiptTokenActive(expiresAt, "2026-09-01T00:10:00Z"), false);
assert.equal(isReceiptTokenActive("not-a-date", null, now), false);
assert.equal(receiptEmailsMatch(" Customer@Example.com ", "customer@example.com"), true);
assert.equal(receiptEmailsMatch("customer@example.com", "other@example.com"), false);
assert.equal(isCustomerOrderNumber("HL-2026-A1B2C3D4E5F6"), true);
assert.equal(
  isHistoricalOrderUuid("6b4f7274-4fe2-403b-a95a-342148e294be"),
  true,
);

const mutableOrder = {
  id: "6b4f7274-4fe2-403b-a95a-342148e294be",
  customer_order_number: "HL-2026-A1B2C3D4E5F6",
  created_at: "2026-09-01T12:00:00.000Z",
  sku: "OASYS_2W_AST_6",
  right_box_count: 4,
  left_box_count: 4,
  total_box_count: 8,
  box_count: 8,
  adjusted_right_box_count: 1,
  adjusted_left_box_count: 1,
  adjusted_total_box_count: 2,
  total_amount_cents: 11_797,
  capture_amount_cents: 11_297,
  feedback_credit_cents: 500,
  shipping_cents: 999,
  shipping_method: "Express shipping",
  price_reason: "flat_retail_v1",
  tax_cents: 0,
  currency: "USD",
  shipping_first_name: "Guest",
  shipping_last_name: "Customer",
  shipping_address1: "must never be selected",
  rx: { right: { sphere: "-2.00" } },
};

const snapshot = buildReceiptSnapshot(mutableOrder, {
  amountReceivedCents: 11_297,
  currency: "usd",
  capturedAt: "2026-09-01T13:00:00.000Z",
  cardBrand: "visa",
  cardLast4: "4242",
});
assert.deepEqual(
  [snapshot.line.rightBoxes, snapshot.line.leftBoxes, snapshot.line.totalBoxes],
  [1, 1, 2],
);
assert.equal(snapshot.line.unitPriceCents, 5_399);
assert.equal(snapshot.line.lineTotalCents, 10_798);
assert.equal(snapshot.shippingCents, 999);
assert.equal(snapshot.taxCents, 0);
assert.equal(snapshot.adjustmentCents, -500);
assert.equal(snapshot.amountPaidCents, 11_297);
assert.equal(receiptSnapshotContainsProhibitedData(snapshot), false);
assert.doesNotMatch(JSON.stringify(snapshot), /sphere|-2\.00|shipping_address|payment_intent/i);

const snapshotWithoutCard = buildReceiptSnapshot(mutableOrder, {
  amountReceivedCents: 11_297,
  currency: "usd",
  capturedAt: "2026-09-01T13:00:00.000Z",
});
assert.equal(snapshotWithoutCard.cardBrand, null);
assert.equal(snapshotWithoutCard.cardLast4, null);

mutableOrder.shipping_first_name = "Changed after capture";
mutableOrder.total_amount_cents = 99_999;
assert.equal(snapshot.customerName, "Guest Customer");
assert.equal(snapshot.amountPaidCents, 11_297);
assert.throws(
  () =>
    buildReceiptSnapshot(mutableOrder, {
      amountReceivedCents: 99_999,
      currency: "usd",
      capturedAt: "2026-09-01T13:00:00.000Z",
    }),
  /do not reconcile/,
);
assert.throws(
  () =>
    buildReceiptSnapshot(
      { ...mutableOrder, total_amount_cents: 11_797, price_reason: null },
      {
        amountReceivedCents: 11_297,
        currency: "usd",
        capturedAt: "2026-09-01T13:00:00.000Z",
      },
    ),
  /pricing provenance is not trustworthy/,
);

const accessEmail = buildReceiptAccessEmail({
  receiptUrl: `https://www.honestlenses.com/receipt/${token}`,
  expiresMinutes: 60,
});
assert.equal(accessEmail.subject, "Your Honest Lenses receipt link");
assert.doesNotMatch(
  `${accessEmail.subject} ${accessEmail.preview}`,
  /contact lens|prescription|hsa|fsa|oasys/i,
);
assert.doesNotMatch(accessEmail.text, new RegExp(`${mutableOrder.id}|customer@example`, "i"));

const receiptPage = readFileSync(
  resolve(process.cwd(), "src/app/receipt/[token]/page.tsx"),
  "utf8",
);
assert.doesNotMatch(
  receiptPage,
  /payment_intent|prescriber|date_of_birth|shipping_address|base_curve|diameter|cylinder|axis/i,
);

const confirmationRoute = readFileSync(
  resolve(process.cwd(), "src/app/api/checkout/authorized/route.ts"),
  "utf8",
);
assert.doesNotMatch(confirmationRoute, /buildReceiptAccessEmail|receipt_access/);

async function testCaptureReceiptEmailOrdering() {
  const { captureAuthorizedOrderPayment } = await import(
    "@/lib/payments/legacyPaymentCommands"
  );
  const calls: string[] = [];
  const stripeMock = {
  paymentIntents: {
    retrieve: async () => {
      calls.push("retrieve");
      return {
        id: "pi_test_receipt",
        status: "requires_capture",
        amount: 11_797,
        amount_capturable: 11_797,
        amount_received: 0,
        receipt_email: null,
      } as Stripe.PaymentIntent;
    },
    update: async (_id: string, params: Stripe.PaymentIntentUpdateParams) => {
      calls.push(`update:${params.receipt_email}`);
      return { id: "pi_test_receipt", ...params } as Stripe.PaymentIntent;
    },
    capture: async (_id: string, params: Stripe.PaymentIntentCaptureParams) => {
      calls.push(`capture:${params.amount_to_capture}`);
      return {
        id: "pi_test_receipt",
        status: "succeeded",
        amount_received: params.amount_to_capture,
      } as Stripe.PaymentIntent;
    },
  },
  };

  await captureAuthorizedOrderPayment(
  {
    id: mutableOrder.id,
    payment_intent_id: "pi_test_receipt",
    total_amount_cents: 11_797,
    capture_amount_cents: 11_297,
    feedback_credit_cents: 0,
    shipping_email: " Customer@Example.com ",
  },
  "admin-verification",
  {
    stripe: stripeMock as never,
    createReceiptSnapshot: async () => {
      calls.push("snapshot");
      return true;
    },
  },
  );
  assert.deepEqual(calls, [
    "retrieve",
    "update:customer@example.com",
    "capture:11297",
    "snapshot",
  ]);
}

const recoveryRoute = readFileSync(
  resolve(process.cwd(), "src/app/api/receipts/find/route.ts"),
  "utf8",
);
assert.match(recoveryRoute, /enforceRateLimit/);
assert.match(recoveryRoute, /NEUTRAL_MESSAGE/);
assert.match(recoveryRoute, /receiptEmailsMatch/);
assert.doesNotMatch(recoveryRoute, /receipt_url/);

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260901161929_add_secure_receipt_system.sql",
  ),
  "utf8",
);
assert.match(migration, /enable row level security/);
assert.match(migration, /reject_receipt_snapshot_mutation/);
assert.match(migration, /revoke all[\s\S]*anon, authenticated/);

testCaptureReceiptEmailOrdering()
  .then(() => console.log("Secure receipt system tests passed"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
