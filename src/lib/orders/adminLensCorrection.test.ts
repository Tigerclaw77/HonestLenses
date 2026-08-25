import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getLensById } from "@/LensCore";
import { getAuthoritativeOrderQuote } from "./orderPricing";
import { buildAdminLensCorrectionPatch } from "./adminLensCorrection";
import { projectOrderCommerce } from "./orderCommerce";

const lens = getLensById("MYDAY");
assert.ok(lens, "MyDay must exist in the current catalog");
const quote = getAuthoritativeOrderQuote({
  sku: "MYDAY_90",
  totalBoxes: 1,
  rightBoxCount: 1,
  leftBoxCount: 0,
  shippingMethod: "standard",
});

// Ali-style historical reconciliation: the verified MyDay values arrive from
// the correction entry, not the stale Ultra values on the original order.
const verifiedMyDayRx = {
  expires: "2026-09-13",
  right: { sphere: -3.75, base_curve: 8.4, diameter: 14.2 },
  left: { sphere: -3.75, base_curve: 8.4, diameter: 14.2 },
};
const correction = buildAdminLensCorrectionPatch({
  order: { id: "ali-order", admin_notes: "Original order: Ultra / ULTRA_6; 2 boxes; verification information needed." },
  lens,
  sku: "MYDAY_90",
  quote,
  actor: "admin@example.com",
  now: "2026-08-24T12:00:00.000Z",
  input: {
    ...verifiedMyDayRx,
    rightBoxCount: 1,
    leftBoxCount: 0,
    sharedPackForBothEyes: true,
    reason: "Doctor-confirmed MyDay substitution; customer approved.",
    customerApprovedSubstitution: true,
    paymentAlreadyCaptured: true,
    capturedAmountCents: 11899,
    supplierOrderAlreadyPlaced: true,
  },
});

assert.equal(correction.sku, "MYDAY_90");
assert.equal(correction.manufacturer, "coopervision");
assert.equal(correction.rx_lens_brand, "MyDay");
assert.deepEqual(correction.rx.right, { ...verifiedMyDayRx.right, coreId: "MYDAY", brand: "MyDay" });
assert.deepEqual(correction.rx.left, { ...verifiedMyDayRx.left, coreId: "MYDAY", brand: "MyDay" });
assert.equal(correction.right_box_count, 1);
assert.equal(correction.left_box_count, 0);
assert.equal(correction.total_box_count, 1);
assert.equal(correction.adjusted_total_box_count, 1);
assert.equal(correction.status, "captured");
assert.equal(correction.payment_status, "captured");
assert.equal(correction.capture_amount_cents, 11899, "the real historical captured amount is retained");
assert.equal(correction.fulfillment_status, "ordered");
assert.equal(correction.verification_status, "verified");
assert.equal(correction.verification_method, "manual");
assert.equal("total_amount_cents" in correction, false, "a record correction never rewrites historical price truth");
assert.equal("revised_total_amount_cents" in correction, false, "a record correction never invents a revised Stripe charge");
assert.match(correction.admin_notes, /Customer approved substitution: yes/);
assert.match(correction.admin_notes, /Supplier order already placed manually: yes/);
assert.deepEqual(projectOrderCommerce(correction).quantity, {
  right: 1,
  left: 0,
  total: 1,
  adjusted: true,
}, "fulfillment sees exactly one physical MyDay pack");

async function verifyArmoryProjection() {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
  const { toArmoryOrder } = await import("@/app/api/armory/orders/route");
  const armoryOrder = toArmoryOrder({
    ...correction,
    id: "ali-order",
    created_at: "2026-08-24T12:00:00.000Z",
    payment_intent_id: "pi_captured",
  });
  assert.deepEqual(armoryOrder.product, {
    name: "MyDay",
    sku: "MYDAY_90",
    manufacturer: "coopervision",
  });
  assert.deepEqual(armoryOrder.supply, {
    quantity: 1,
    unit: "boxes",
    durationMonths: 3,
    annual: false,
    rightBoxes: 1,
    leftBoxes: 0,
  });
}

assert.throws(
  () => buildAdminLensCorrectionPatch({
    order: { id: "order-invalid" }, lens, sku: "MYDAY_90", quote,
    actor: "admin@example.com", now: "2026-08-24T12:00:00.000Z",
    input: {
      ...verifiedMyDayRx,
      right: { sphere: -3.75, base_curve: 8.6, diameter: 14.2 },
      left: { sphere: -3.75, base_curve: 8.6, diameter: 14.2 },
      rightBoxCount: 1, leftBoxCount: 0, sharedPackForBothEyes: true,
      reason: "Bad BC", customerApprovedSubstitution: true,
      paymentAlreadyCaptured: false, capturedAmountCents: null,
      supplierOrderAlreadyPlaced: false,
    },
  }),
  /Invalid base curve/,
);
assert.throws(
  () => buildAdminLensCorrectionPatch({
    order: { id: "order-invalid" }, lens, sku: "MYDAY_90", quote,
    actor: "admin@example.com", now: "2026-08-24T12:00:00.000Z",
    input: {
      ...verifiedMyDayRx,
      left: { sphere: -4, base_curve: 8.4, diameter: 14.2 },
      rightBoxCount: 1, leftBoxCount: 0, sharedPackForBothEyes: true,
      reason: "Non-identical shared Rx", customerApprovedSubstitution: true,
      paymentAlreadyCaptured: false, capturedAmountCents: null,
      supplierOrderAlreadyPlaced: false,
    },
  }),
  /shared pack requires identical/,
);

const correctionRouteSource = readFileSync(
  join(process.cwd(), "src", "app", "api", "admin", "orders", "correct-lens", "route.ts"),
  "utf8",
);
assert.doesNotMatch(correctionRouteSource, /from "stripe"|new Stripe|paymentIntents\.|charges\.|refunds\./i,
  "record correction cannot perform a Stripe read or write");
assert.doesNotMatch(correctionRouteSource, /(?:supplier|oogp)(?:Order)?\.(?:submit|create|place)\(/i,
  "record correction cannot submit a supplier order");
assert.match(correctionRouteSource, /event_type: "admin_lens_prescription_reconciliation"/,
  "the correction has an explicit audit event");
assert.match(correctionRouteSource, /\.rpc\(\s*"apply_admin_lens_reconciliation"/,
  "the route persists order and audit through the transactional RPC");
assert.doesNotMatch(correctionRouteSource, /\.from\("orders"\)[\s\S]*?\.update\(/,
  "the route does not issue a separate orders update");
assert.doesNotMatch(correctionRouteSource, /\.from\("order_events"\)\.insert\(/,
  "the route does not issue a separate audit insert");
const migrationSource = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260825004231_admin_lens_reconciliation.sql"),
  "utf8",
);
assert.match(migrationSource, /create function public\.apply_admin_lens_reconciliation\(/);
assert.match(migrationSource, /update public\.orders[\s\S]*?returning to_jsonb\(orders\) into v_order;[\s\S]*?insert into public\.order_events/,
  "the database function performs the order update and audit insert in one function transaction");
assert.match(migrationSource, /security invoker[\s\S]*?revoke all[\s\S]*?grant execute[\s\S]*?to service_role/,
  "the RPC is only callable by the server service-role client");

void verifyArmoryProjection()
  .then(() => console.log("Admin lens correction regression tests passed."))
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
