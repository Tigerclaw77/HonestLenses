import assert from "node:assert/strict";
import { chooseRecall, documentedExpiration, expirationReminderAt,
  nextEligibleAt, requiresJurisdictionReview, sameNamedRecipientAndPatient,
  suppressionReason } from "./recallPolicy";

const day = 86_400_000;
const now = Date.parse("2026-10-20T12:00:00Z");
const at = (days: number) => new Date(now + days * day).toISOString();
const rx = { rx: { expires: "2027-01-15" }, rx_expiration_date: "2027-01-15",
  verification_status: "verified", verification_passed: true,
  verification_completed_at: at(-10), patient_first_name: "Internal",
  patient_last_name: "Test", patient_dob: "1990-01-01" };

assert.equal(documentedExpiration(rx, now), "2027-01-15");
assert.equal(expirationReminderAt("2027-01-15", now), "2026-12-01T12:00:00.000Z");
assert.equal(documentedExpiration({ ...rx, rx_expiration_date: "2027-02-01" }, now), null);
assert.equal(documentedExpiration({ ...rx, rx: { expires: "2026-01-01" } }, now), null);
assert.equal(documentedExpiration({ ...rx, rx: { expires: "2027-01-15" },
  verification_status: "pending" }, now), null);
assert.equal(documentedExpiration({ ...rx, rx: { expires: "2027-01-15" },
  rx_dob: "1991-01-01" }, now), null);
assert.equal(documentedExpiration({ ...rx, rx: {} }, now), null);
assert.equal(expirationReminderAt("2026-11-01", now), null, "No expiration catch-up");

assert.equal(chooseRecall({ replenishmentAt: at(0), now })?.kind, "replenishment");
assert.equal(chooseRecall({ expirationAt: at(0), expirationDate: "2026-12-04", now })?.kind,
  "expiration");
for (const gap of [0, 10, 29]) {
  assert.equal(chooseRecall({ replenishmentAt: at(0), expirationAt: at(gap),
    expirationDate: "2026-12-20", now })?.kind, "combined", `${gap}-day gap`);
}
assert.equal(chooseRecall({ replenishmentAt: at(0), expirationAt: at(31),
  expirationDate: "2026-12-20", now })?.kind, "replenishment");
assert.equal(chooseRecall({ replenishmentAt: at(31), expirationAt: at(0),
  expirationDate: "2026-12-20", now })?.kind, "expiration");
assert.equal(chooseRecall({ replenishmentAt: at(3), now }), null);
assert.equal(chooseRecall({ replenishmentAt: at(3), now, dueBy: now + 30 * day })?.kind,
  "replenishment");

const base = { captured: true, paymentValid: true, now };
assert.equal(suppressionReason(base), null);
assert.equal(suppressionReason({ ...base, optedOut: true }), "opted_out");
assert.equal(suppressionReason({ ...base, bounced: true }), "bounced");
assert.equal(suppressionReason({ ...base, recentPurchase: true }), "recent_purchase");
assert.equal(suppressionReason({ ...base, pendingReorder: true }), "pending_reorder");
assert.equal(suppressionReason({ ...base, newerOrder: true }), "newer_order");
assert.equal(suppressionReason({ ...base, synthetic: true }), "synthetic_test");
assert.equal(suppressionReason({ ...base, captured: false }), "inactive_order");
assert.equal(suppressionReason({ ...base, paymentValid: false }), "refunded_or_unverified_payment");
assert.equal(suppressionReason({ ...base, lastClaimedAt: at(-29) }), "cooldown");
assert.equal(suppressionReason({ ...base, lastClaimedAt: at(-30) }), null);
assert.equal(suppressionReason({ ...base, lastClaimedAt: at(-31), claimStatus: "unknown" }),
  "delivery_review");
assert.equal(nextEligibleAt(at(0)), at(30));
assert.equal(requiresJurisdictionReview("WA"), true);
assert.equal(requiresJurisdictionReview("ct"), true);
assert.equal(requiresJurisdictionReview(null), true);
assert.equal(requiresJurisdictionReview("TX"), false);
assert.equal(requiresJurisdictionReview(" Texas "), false);
for (const state of ["CA", "CO", "NY", "WA", "CT", "", "T.X."]) {
  assert.equal(requiresJurisdictionReview(state), true, `${state} must be held`);
}
assert.equal(sameNamedRecipientAndPatient({ shipping_first_name: " Alex ",
  shipping_last_name: "Smith", patient_first_name: "alex", patient_last_name: "SMITH" }), true);
assert.equal(sameNamedRecipientAndPatient({ shipping_first_name: "Alex",
  shipping_last_name: "Smith", patient_first_name: "Alex", patient_last_name: "Jones" }), false);
assert.equal(sameNamedRecipientAndPatient({ shipping_first_name: "Alex",
  shipping_last_name: "Smith", patient_first_name: "Alex" }), false);

process.env.ORDER_RESUME_TOKEN_SECRET = "unit-test-only-recall-secret";
process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "unit-test-only";
process.env.RESEND_API_KEY = "re_unit_only";
async function testEmail() {
const { buildReorderReminder } = await import("./reminders");
const common = { orderId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  firstName: "Internal", reorderUrl: "https://example.test/reorder/entry",
  postalAddress: "1401 Lake Plaza Dr, Suite 200-102, Spring, TX 77389" };
const message = buildReorderReminder(common);
assert.equal(message.subject, "A friendly reminder from Honest Lenses");
assert.match(message.text, /Just checking in! If you need more contact lenses, reordering is quick and easy\./);
assert.match(message.text, /Reorder My Contacts/);
assert.match(message.text, /Remind Me Later/);
assert.match(message.text, /Stop Reminders/);
assert.match(message.html, /1401 Lake Plaza Dr, Suite 200-102, Spring, TX 77389/);
assert.match(message.html, /display:inline-block/);
assert.doesNotMatch(message.subject + message.text + message.html,
  /prescription|patient|expires|depletion|1990-01-01|2027-01-15/i);
assert.doesNotMatch(message.text, /Remind Me in 60 Days|Choose a Reminder Date/);
assert.match(buildReorderReminder({ ...common, copyVariant: "reliable" }).text,
  /you may be getting close to needing more contacts/);
assert.match(buildReorderReminder({ ...common, copyVariant: "uncertain" }).text,
  /It's been a little while since your last order/);
assert.match(buildReorderReminder({ ...common, copyVariant: "follow_up" }).text,
  /You asked us to check back around now/);
console.log("Recall timing, coordination, suppression, controls, and private email copy passed. No email sent.");
}
void testEmail().catch(error => { console.error(error); process.exitCode = 1; });
