import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { reconcileCachedOrderDetails } from "../admin/orderMutationReconciliation";

function source(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), "utf8");
}

const page = source("src", "app", "admin", "orders", "page.tsx");
const queueRoute = source("src", "app", "api", "admin", "orders", "route.ts");
const fulfillmentRoute = source(
  "src",
  "app",
  "api",
  "admin",
  "orders",
  "[id]",
  "route.ts",
);
const archiveRoute = source(
  "src",
  "app",
  "api",
  "orders",
  "[id]",
  "archive",
  "route.ts",
);
const prescriptionRoute = source(
  "src",
  "app",
  "api",
  "admin",
  "orders",
  "[id]",
  "prescription",
  "route.ts",
);
const acceptanceMigration = source(
  "supabase",
  "migrations",
  "20260915004000_add_atomic_admin_prescription_acceptance.sql",
);

assert.match(
  queueRoute,
  /reconcileAdminPaymentState\([\s\S]*source: "queue_refresh"/,
  "queue refresh safely reconciles Stripe-authoritative payment state",
);
assert.match(page, /window\.setInterval\([\s\S]*10 \* 60 \* 1000/, "ten-minute safety polling backs up realtime queue delivery");
assert.match(page, /Accept prescription/, "prescription action is direct");
assert.match(page, /Capture payment/, "payment action is direct");
assert.match(page, /Mark supplier order placed/, "supplier action is direct");
assert.match(page, /reconcileOrderAfterMutation/, "state-changing actions trigger targeted authoritative reconciliation");
assert.match(page, /loadOrderDetails\(orderId, \{ force: true \}\)/, "open-card detail state is forcibly refetched after mutations");
assert.match(page, /reconcileCachedOrderDetails/, "queue refreshes reconcile cached expanded-card state");
assert.match(page, /confirmed: true/, "operator acceptance sends explicit confirmation");
assert.doesNotMatch(page, /Founder Override & capture payment/, "routine actions are not compounded");
assert.doesNotMatch(page, /setAdminError\("Invalid fulfillment status\."\)/, "valid operator actions do not end in a generic state-machine error");
assert.match(
  fulfillmentRoute,
  /already_done: true/,
  "already-recorded fulfillment actions are idempotent",
);
assert.match(
  fulfillmentRoute,
  /admin_supplier_order_placed/,
  "supplier placement records audit history",
);
assert.match(archiveRoute, /requestedArchived = body\.archived/, "archive endpoint supports restore");
assert.match(archiveRoute, /admin_order_restored/, "restore records audit history");
assert.match(page, /Restore order/, "archived unfinished orders expose direct recovery");
assert.match(page, /Mark email issue resolved/, "email attention has a direct resolution");
assert.match(prescriptionRoute, /OPERATOR_CONFIRMATION_REQUIRED/, "server rejects unconfirmed operator acceptance");
assert.match(prescriptionRoute, /apply_admin_prescription_acceptance/, "operator acceptance uses the atomic audited transition");
assert.doesNotMatch(prescriptionRoute, /captureAuthorizedOrderPayment/, "operator Rx acceptance remains independent from payment capture");
assert.match(acceptanceMigration, /for update;/i, "operator acceptance locks the order before changing state");
assert.match(acceptanceMigration, /'verification_reason', v_order\.rx_status/, "audit preserves the previous automation reason");
assert.match(acceptanceMigration, /'operator_confirmed', true/, "audit records explicit operator confirmation");
assert.match(acceptanceMigration, /p_actor[\s\S]*v_completed_at[\s\S]*'verified'/, "audit records operator, timestamp, and resulting state");

const staleDetail = {
  id: "order-sofia-regression",
  status: "authorized",
  verification_status: "information_needed",
  fulfillment_status: "review",
  stripe_payment_intent_status: "requires_capture",
  rx_ocr_raw: { text: "detail-only OCR payload" },
};
const reconciledDetail = reconcileCachedOrderDetails<
  { id: string; [key: string]: unknown }
>(
  { [staleDetail.id]: staleDetail },
  [{
    id: staleDetail.id,
    status: "captured",
    verification_status: "verified",
    fulfillment_status: "ready_to_order",
    stripe_payment_intent_status: "succeeded",
  }],
)[staleDetail.id];
assert.equal(reconciledDetail.verification_status, "verified");
assert.equal(reconciledDetail.status, "captured");
assert.equal(reconciledDetail.fulfillment_status, "ready_to_order");
assert.deepEqual(reconciledDetail.rx_ocr_raw, staleDetail.rx_ocr_raw, "detail-only fields survive queue reconciliation");

console.log("Admin operator workflow regression tests passed.");
