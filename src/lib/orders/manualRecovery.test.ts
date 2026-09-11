import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyAbandonedCheckout } from "@/lib/ops/abandonedCheckout";
import { buildAbandonedCheckoutRecoveryEmail } from "@/lib/email/recoveryEmail";
import { getResumeDestination } from "@/lib/order-recovery";
import {
  getManualRecoveryReview,
  isManualRecoveryCandidate,
  MANUAL_RECOVERY_CUTOFF,
  type ManualRecoveryLedgerRow,
} from "./manualRecovery";

const now = new Date("2026-09-11T12:00:00.000Z");
const base = {
  id: "00000000-0000-4000-8000-000000000001",
  status: "draft",
  payment_status: "draft",
  fulfillment_status: "review",
  sku: "OASYS_1D_90",
  shipping_email: "customer@example.test",
  shipping_first_name: "Casey",
  shipping_last_name: "Customer",
  shipping_address1: "1 Test Way",
  shipping_city: "Katy",
  shipping_state: "TX",
  shipping_zip: "77449",
  created_at: MANUAL_RECOVERY_CUTOFF,
  updated_at: "2026-09-11T08:00:00.000Z",
};

function review(
  order: Parameters<typeof classifyAbandonedCheckout>[0] & {
    id: string;
    created_at?: string | null;
    shipping_email?: string | null;
    email_delivery_status?: string | null;
    sku?: string | null;
    fulfillment_status?: string | null;
    confirmation_email_sent_at?: string | null;
  },
  ledger: ManualRecoveryLedgerRow[] = [],
) {
  return getManualRecoveryReview(order, ledger);
}

assert.equal(review({ ...base, created_at: "2026-09-04T23:59:59.999Z" }), null);
assert.equal(review(base)?.state, "unresolved");
for (const shipping_email of [null, "", "not-an-email"]) {
  assert.equal(review({ ...base, shipping_email }), null);
}
for (const email_delivery_status of ["bounced", "complained", "suppressed", "failed"]) {
  assert.equal(review({ ...base, email_delivery_status }), null);
}
for (const status of ["completed", "captured", "fulfilled", "canceled", "cancelled", "refunded", "paid", "shipped"]) {
  assert.equal(review({ ...base, status }), null, status);
}
for (const fulfillment_status of ["ordered", "backordered", "shipped", "delivered", "completed", "cancelled"]) {
  assert.equal(review({ ...base, fulfillment_status }), null, fulfillment_status);
}
for (const payment_status of ["authorized", "captured", "refunded", "cancelled", "failed"]) {
  assert.equal(review({ ...base, payment_status }), null, payment_status);
}
assert.equal(review({ ...base, confirmation_email_sent_at: now.toISOString() }), null);
assert.equal(review(base, [{ state: "sent", sent_at: now.toISOString() }])?.state, "sent");
assert.equal(review(base, [{ state: "ignored", ignored_at: now.toISOString() }])?.state, "ignored");
assert.equal(
  isManualRecoveryCandidate(base),
  true,
);

const productionRegressionShapes = [
  {
    id: "cdafcf6b-21b7-4310-b893-d882ed228af9",
    sku: "BIOFINITY_6",
    rx_upload_path: null,
    updated_at: "2026-09-11T11:30:00.000Z",
  },
  {
    id: "1de81bbd-5dbf-4068-9165-cbc3d66265c2",
    sku: "OASYS_1D_90",
    rx_upload_path: "private/fixture-rx.jpg",
    updated_at: "2026-09-11T04:30:00.000Z",
  },
  {
    id: "d6528f78-302f-4f13-90f7-a5cf57286d1b",
    sku: "VITA_12",
    rx_upload_path: null,
    updated_at: "2026-09-10T16:00:00.000Z",
  },
] as const;

for (const shape of productionRegressionShapes) {
  const order = {
    ...base,
    ...shape,
    payment_intent_id: `pi_fixture_${shape.id}`,
    stripe_payment_intent_status: "requires_payment_method",
  };
  assert.ok(getResumeDestination(order), `${shape.id} can generate a secure resume destination`);
  assert.equal(
    getManualRecoveryReview(order, [])?.state,
    "unresolved",
    `${shape.id} is eligible without a pre-existing recovery record`,
  );
}

assert.equal(
  classifyAbandonedCheckout(
    { ...base, updated_at: "2026-09-11T11:30:00.000Z" },
    { now },
  ).isAbandoned,
  false,
  "the regression proves manual incomplete-order eligibility is independent of the two-hour abandonment threshold",
);

const email = buildAbandonedCheckoutRecoveryEmail({
  customerName: "Casey",
  customerEmail: base.shipping_email,
  orderId: base.id,
  resumeUrl: "https://honestlenses.com/resume-order/accept?token=test-token",
});
const approvedNamedBody = `Hi Casey,

It looks like you started an order with Honest Lenses but didn’t finish checking out.

If you’d still like to complete your order, you can securely pick up where you left off here:

https://honestlenses.com/resume-order/accept?token=test-token

If you no longer wish to complete the order, no action is needed.

Thank you,
Honest Lenses`;
assert.equal(email.subject, "Complete your Honest Lenses order");
assert.equal(email.text, approvedNamedBody);
assert.equal(
  email.html,
  `<p>Hi Casey,</p>
<p>It looks like you started an order with Honest Lenses but didn’t finish checking out.</p>
<p>If you’d still like to complete your order, you can securely pick up where you left off here:</p>
<p><a href="https://honestlenses.com/resume-order/accept?token=test-token">https://honestlenses.com/resume-order/accept?token=test-token</a></p>
<p>If you no longer wish to complete the order, no action is needed.</p>
<p>Thank you,<br>Honest Lenses</p>`,
);

const genericEmail = buildAbandonedCheckoutRecoveryEmail({
  customerName: null,
  customerEmail: base.shipping_email,
  orderId: base.id,
  resumeUrl: "https://honestlenses.com/resume-order/accept?token=test-token",
});
assert.equal(genericEmail.text, approvedNamedBody.replace("Hi Casey,", "Hi,"));
assert.match(genericEmail.html, /^<p>Hi,<\/p>/);

const page = readFileSync("src/app/admin/orders/page.tsx", "utf8");
const route = readFileSync("src/app/api/admin/abandoned-checkouts/[id]/route.ts", "utf8");
const server = readFileSync("src/lib/orders/manualRecoveryServer.ts", "utf8");
const accept = readFileSync("src/app/resume-order/accept/route.ts", "utf8");
const css = readFileSync("src/styles/globals.css", "utf8");
const scheduler = readFileSync("src/lib/orderOperationsServer.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260911120000_manual_abandoned_order_recovery.sql",
  "utf8",
);

assert.match(page, /Send recovery email/);
assert.match(page, /Ignore/);
assert.match(page, /order\.recovery_review\?\.state === "unresolved"/);
assert.match(page, /o\.recovery_review\?\.state === "unresolved"/);
assert.match(page, /const archiveOrders = orders\.filter\(shouldDefaultCollapse\)\.sort\(archiveSort\)/);
assert.match(page, /return getOrderCreatedTimestamp\(b\) - getOrderCreatedTimestamp\(a\)/);
assert.doesNotMatch(page, /abandonedOrders/);
assert.doesNotMatch(page, /selectedAbandonedOrderIds/);
assert.doesNotMatch(page, /type="checkbox"/);
assert.doesNotMatch(page, /Select all|Archive selected|Delete selected/);
assert.match(page, /confirm\(/);
assert.match(route, /body\.confirmed !== true/);
assert.match(route, /sendManualRecovery/);
assert.match(route, /ignoreManualRecovery/);
assert.match(server, /manual-order-recovery:\$\{order\.id\}/);
assert.match(server, /getAuthoritativeCandidate\(order\.id\)/);
assert.match(server, /updateOrderSummary: false/);
assert.match(accept, /recovery_touch_drafts/);
assert.match(accept, /getRecoverableOrder\(draft\.order_id, draft\.email\)/);
assert.match(css, /@media \(max-width: 640px\)/);
assert.match(css, /\.admin-history-row/);
assert.match(migration, /for update/gi);
assert.match(migration, /claim_manual_recovery_delivery/);
assert.match(migration, /ignore_manual_recovery/);
assert.match(migration, /state in \('sending', 'sent', 'ignored', 'needs_review'\)/);
const runner = scheduler.slice(scheduler.indexOf("export async function runOrderOperations"));
assert.doesNotMatch(runner, /processRecovery\(/, "scheduled operations cannot send recovery email");

console.log(
  "Manual recovery eligibility, single chronological History/Archive list, row-only highlight, Details-only actions, no bulk controls, and backend safety checks passed.",
);
