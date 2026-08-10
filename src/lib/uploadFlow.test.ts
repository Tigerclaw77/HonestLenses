import assert from "node:assert/strict";
import {
  classifyUploadHttpFailure,
  hasUploadedEvidenceWithoutPrescription,
  uploadNeedsRecovery,
} from "./uploadFlow";

assert.equal(
  classifyUploadHttpFailure(400, { code: "invalid_upload" }),
  "EXPECTED_VALIDATION",
);
assert.equal(classifyUploadHttpFailure(429, {}), "HANDLED_RECOVERABLE");
assert.equal(
  classifyUploadHttpFailure(503, { code: "rate_limit_unavailable" }),
  "GENUINE_SERVER_FAILURE",
);
assert.equal(classifyUploadHttpFailure(404, {}), "UNKNOWN");

assert.equal(
  uploadNeedsRecovery({ ok: true, usable: false, reviewRequired: true }),
  true,
);
assert.equal(
  uploadNeedsRecovery({ ok: true, usable: false, reviewRequired: false }),
  false,
);
assert.equal(uploadNeedsRecovery({ ok: true, usable: true }), false);

assert.equal(
  hasUploadedEvidenceWithoutPrescription({
    rx: null,
    rx_upload_path: "rx/order/prescription.jpg",
  }),
  true,
);
assert.equal(
  hasUploadedEvidenceWithoutPrescription({
    rx: { right: {} },
    rx_upload_path: "rx/order/prescription.jpg",
  }),
  false,
);
assert.equal(
  hasUploadedEvidenceWithoutPrescription({ rx: null, rx_upload_path: null }),
  false,
);

console.log("upload flow tests passed");
