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
const singleEye = estimateReplenishment({ sku: "PRECISION1_30", rightBoxes: 1,
  leftBoxes: 0, orderedAt, wearDaysPerWeek: 5 });
assert.equal(singleEye?.basis, "wear_frequency");
assert.equal(singleEye?.estimatedSupplyDays, 42);
const asymmetric = estimateReplenishment({ sku: "PRECISION1_30", rightBoxes: 2,
  leftBoxes: 1, orderedAt, wearDaysPerWeek: 5 });
assert.equal(asymmetric?.estimatedSupplyDays, singleEye?.estimatedSupplyDays);
assert.equal(estimateReplenishment({ sku: "PRECISION7_27", rightBoxes: 1,
  leftBoxes: 1, orderedAt })?.basis, "neutral_recall");
assert.equal(estimateReplenishment({ sku: "PRECISION7_27", rightBoxes: 1,
  leftBoxes: 1, orderedAt, previousOrderAt: "2026-07-01T00:00:00Z" })?.basis,
  "purchase_history");
assert.equal(estimateReplenishment({ sku: "UNKNOWN", rightBoxes: 1,
  leftBoxes: 0, orderedAt, wearDaysPerWeek: 7 })?.basis, "neutral_recall");

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
console.log("Reorder token, conservative estimate, evidence reuse, and receipt checks passed. No email or payment sent.");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
