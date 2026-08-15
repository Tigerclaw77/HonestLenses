import assert from "node:assert/strict";

import { buildSavedCartEmail } from "./savedCartEmail";

const email = buildSavedCartEmail({
  resumeUrl: "https://honestlenses.com/resume-order/accept?token=test-token",
  expiresDays: 7,
});

assert.match(email.subject, /cart is saved/i);
assert.match(email.text, /secure link/i);
assert.match(email.text, /return to your cart during that time/i);
assert.match(email.text, /not a marketing subscription/i);
assert.match(email.html, /Return to your cart/i);
assert.doesNotMatch(email.text, /prescription|rebate|coupon/i);
assert.doesNotMatch(email.text, /used once/i);

console.log("Saved cart email content checks passed");
