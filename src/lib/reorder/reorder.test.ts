import assert from "node:assert/strict";

async function main() {
process.env.ORDER_RESUME_TOKEN_SECRET = "unit-test-only-reorder-secret";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "unit-test-only";
process.env.RESEND_API_KEY = "re_unit_only";

const { createReorderEntryToken, createReorderAuthToken, createReminderControlToken,
  hashReorderToken, isReorderToken, getReorderEntryUrl } = await import("./tokens");
const { estimateReplenishment } = await import("./estimate");
const { findReusablePrescription } = await import("./verification");
const { buildCustomerOrderEmail } = await import("@/lib/orders/customerOrder");
const { supabaseServer } = await import("@/lib/supabase-server");

const sourceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const draftId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const entry = createReorderEntryToken(sourceId);
assert.ok(isReorderToken(entry));
assert.equal(entry, createReorderEntryToken(sourceId));
assert.notEqual(entry, createReorderEntryToken(draftId));
assert.notEqual(createReorderAuthToken(), createReorderAuthToken());
assert.notEqual(hashReorderToken(entry), entry);
assert.notEqual(createReminderControlToken(sourceId, "stop"),
  createReminderControlToken(sourceId, "postpone_30"));
assert.ok(!getReorderEntryUrl(sourceId).includes(sourceId));

const orderedAt = "2026-10-01T00:00:00Z";
const unilateralRx = { right: { sphere: -2.75 } };
const bilateralRx = { right: { sphere: -2.75 }, left: { sphere: -3.25 } };
const identicalRx = { right: { sphere: -2.75 }, left: { sphere: -2.75 } };
const singleEye = estimateReplenishment({ sku: "PRECISION1_30", rightBoxes: 1,
  leftBoxes: 0, rx: unilateralRx, orderedAt, wearDaysPerWeek: 5 });
assert.equal(singleEye?.wearBasis, "known_frequency");
assert.equal(singleEye?.estimatedSupplyDays, 42);
assert.equal(singleEye?.reminderAt, "2026-11-05T00:00:00.000Z");
const asymmetric = estimateReplenishment({ sku: "PRECISION1_30", rightBoxes: 2,
  leftBoxes: 1, rx: bilateralRx, orderedAt, wearDaysPerWeek: 5 });
assert.equal(asymmetric?.estimatedSupplyDays, singleEye?.estimatedSupplyDays);
const daily = estimateReplenishment({ sku: "PRECISION1_30", rightBoxes: 1,
  leftBoxes: 1, rx: bilateralRx, orderedAt });
assert.equal(daily?.estimatedSupplyDays, 30);
assert.equal(daily?.wearBasis, "assumed_daily");
assert.equal(daily?.reminderAt, "2026-10-24T00:00:00.000Z");
const biweekly = estimateReplenishment({ sku: "OASYS_2W_12", rightBoxes: 1,
  leftBoxes: 1, rx: bilateralRx, orderedAt });
assert.equal(biweekly?.estimatedSupplyDays, 168);
const monthly = estimateReplenishment({ sku: "VITA_12", rightBoxes: 1,
  leftBoxes: 1, rx: bilateralRx, orderedAt });
assert.equal(monthly?.estimatedSupplyDays, 360);
const shared = estimateReplenishment({ sku: "PRECISION7_27", rightBoxes: 1,
  leftBoxes: 0, rx: identicalRx, orderedAt });
assert.equal(shared?.eyeBasis, "shared_identical_ou");
assert.equal(shared?.estimatedSupplyDays, 91);
const weeklyUnilateral = estimateReplenishment({ sku: "PRECISION7_27", rightBoxes: 1,
  leftBoxes: 0, rx: unilateralRx, orderedAt });
assert.equal(weeklyUnilateral?.estimatedSupplyDays, 189);
const partialOu = estimateReplenishment({ sku: "PRECISION1_30", rightBoxes: 1,
  leftBoxes: 0, rx: bilateralRx, orderedAt });
assert.equal(partialOu?.eyeBasis, "single_eye_allocation");
assert.equal(partialOu?.confidence, "low");
assert.equal(estimateReplenishment({ sku: "PRECISION7_27", rightBoxes: 1,
  leftBoxes: 0, rx: { right: { sphere: -2.75, cylinder: 0 },
    left: { cylinder: 0, sphere: -2.75 } }, orderedAt })?.eyeBasis,
  "shared_identical_ou");
const uncertain = estimateReplenishment({ sku: "PRECISION1_30", rightBoxes: 1,
  leftBoxes: 0, orderedAt });
assert.equal(uncertain?.estimatedSupplyDays, 15);
assert.equal(uncertain?.eyeBasis, "assumed_bilateral");
assert.equal(uncertain?.confidence, "low");
assert.equal(estimateReplenishment({ sku: "UNKNOWN", rightBoxes: 1,
  leftBoxes: 0, orderedAt, wearDaysPerWeek: 7 }), null);
assert.equal(estimateReplenishment({ sku: "PRECISION1_30", rightBoxes: 0,
  leftBoxes: 0, orderedAt }), null);
assert.equal(estimateReplenishment({ sku: "PRECISION1_30", rightBoxes: 1,
  leftBoxes: 1, rx: unilateralRx, orderedAt }), null);
assert.equal(estimateReplenishment({ sku: "PRECISION1_30", rightBoxes: 1,
  leftBoxes: 0, rx: { left: { sphere: -2.75 } }, orderedAt }), null);
const delivery = estimateReplenishment({ sku: "PRECISION1_30", rightBoxes: 1,
  leftBoxes: 0, rx: unilateralRx, orderedAt, deliveredAt: "2026-10-10T00:00:00Z",
  estimatedDeliveredAt: "2026-10-08T00:00:00Z", wearDaysPerWeek: 7 });
assert.equal(delivery?.deliveryBasis, "confirmed");
assert.equal(delivery?.reminderAt, "2026-10-26T00:00:00.000Z");
assert.equal(estimateReplenishment({ sku: "PRECISION1_30", rightBoxes: 1,
  leftBoxes: 0, rx: unilateralRx, orderedAt,
  estimatedDeliveredAt: "2026-10-08T00:00:00Z" })?.deliveryBasis, "estimated");

const rx = { expires: "2027-05-27", right: { coreId: "PRECISION7", sphere: -2.75,
  base_curve: 8.4, diameter: 14.2 } };
const source = { id: sourceId, status: "captured", verification_status: "verified",
  verification_passed: true, verification_completed_at: "2026-09-01T00:00:00Z", rx,
  patient_first_name: "Test", patient_last_name: "Patient", patient_dob: "1990-01-01" };
const draft = { id: draftId, rx: structuredClone(rx), patient_first_name: "Test",
  patient_last_name: "Patient", patient_dob: "1990-01-01" };
let hasEvidence = true;
let hasWithdrawal = false;
let sourceRecord: typeof source = source;
supabaseServer.from = ((table: string) => {
  let eventType = "";
  const query = { select: () => query, eq: () => query, in: (_field: string, values: string[]) => {
      eventType = values.includes("verification_rejected") ? "withdrawal" : "evidence";
      return query;
    }, gte: () => query,
    limit: () => query,
    maybeSingle: async () => ({ data: table === "reorder_drafts"
      ? { source_order_id: sourceId }
      : table === "orders" ? sourceRecord
      : eventType === "withdrawal" ? hasWithdrawal ? { id: "withdrawal" } : null
      : hasEvidence ? { id: "event" } : null, error: null }) };
  return query;
}) as unknown as typeof supabaseServer.from;
assert.deepEqual(await findReusablePrescription(draft),
  { sourceOrderId: sourceId, verifiedAt: source.verification_completed_at });
assert.equal(await findReusablePrescription({ ...draft, rx: { ...rx,
  right: { ...rx.right, sphere: -3.0 } } }), null);
assert.equal(await findReusablePrescription({ ...draft, rx: { ...rx,
  expires: "2025-05-27" } }), null);
hasEvidence = false;
assert.equal(await findReusablePrescription(draft), null);
hasEvidence = true;
hasWithdrawal = true;
assert.equal(await findReusablePrescription(draft), null);
hasWithdrawal = false;
sourceRecord = { ...source, verification_passed: false };
assert.equal(await findReusablePrescription(draft), null);

process.env.ORDER_ACCESS_TOKEN_SECRET = "unit-test-only-order-access-secret";
const receipt = buildCustomerOrderEmail({ orderId: sourceId,
  customerOrderNumber: "HL-2026-TEST", receiptUrl: "https://example.test/receipt/token",
  reorderUrl: getReorderEntryUrl(sourceId), isUploaded: false });
assert.match(receipt.text, /Reorder My Contacts/);
assert.match(receipt.text, /Need more contacts\?/);
assert.match(receipt.text, /Reorder your previous lenses quickly and securely, without creating an account\./);
assert.match(receipt.html, /Open secure receipt/);
assert.ok(!receipt.text.includes("Test Patient"));
console.log("Reorder token, supply estimates, evidence reuse, and receipt checks passed. No email or payment sent.");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
