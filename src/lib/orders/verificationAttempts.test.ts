import { strict as assert } from "node:assert";
import {
  collectLatestVerificationAttempts,
  getVerificationAttemptEventType,
  isManualVerificationAttemptMethod,
} from "./verificationAttempts";

assert.equal(isManualVerificationAttemptMethod("phone"), true);
assert.equal(isManualVerificationAttemptMethod("fax"), true);
assert.equal(isManualVerificationAttemptMethod("email"), false);
assert.equal(getVerificationAttemptEventType("phone"), "verification_phone_attempted");
assert.equal(getVerificationAttemptEventType("fax"), "verification_fax_attempted");

const attempts = collectLatestVerificationAttempts([
  {
    order_id: "order-a",
    event_type: "verification_phone_attempted",
    created_at: "2026-07-30T15:00:00.000Z",
  },
  {
    order_id: "order-a",
    event_type: "verification_phone_attempted",
    created_at: "2026-07-30T16:00:00.000Z",
  },
  {
    order_id: "order-a",
    event_type: "verification_fax_attempted",
    created_at: "2026-07-30T15:30:00.000Z",
  },
  {
    order_id: "order-a",
    event_type: "verification_information_needed",
    created_at: "2026-07-30T17:00:00.000Z",
  },
]);

assert.deepEqual(attempts.get("order-a"), {
  phoneAttemptedAt: "2026-07-30T16:00:00.000Z",
  faxAttemptedAt: "2026-07-30T15:30:00.000Z",
});

console.log("Verification attempt tracker tests passed.");
