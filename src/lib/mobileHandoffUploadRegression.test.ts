import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { classifyMobileHandoffUploadResponse } from "./mobileHandoffUploadResponse";

// Regression: a fresh QR whose atomic claim temporarily conflicts must remain
// retryable. A generic 409 must never be presented as ten-minute expiry.
assert.equal(classifyMobileHandoffUploadResponse(409, "handoff_busy"), "retry");
assert.equal(classifyMobileHandoffUploadResponse(500, "handoff_claim_failed"), "retry");
assert.equal(classifyMobileHandoffUploadResponse(400, "invalid_upload"), "retry");
assert.equal(classifyMobileHandoffUploadResponse(409, "handoff_expired"), "expired");
assert.equal(classifyMobileHandoffUploadResponse(409, "handoff_completed"), "complete");

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const store = source("src/lib/server/prescriptionHandoffStore.ts");
const route = source("src/app/api/prescription-handoffs/mobile/upload/route.ts");

// Fresh and stale claims use state-specific atomic predicates. This replaces
// the production-failing PostgREST OR predicate without weakening concurrency.
assert.match(store, /existing\.upload_claim_id === null[\s\S]*\.is\("upload_claim_id", null\)/);
assert.match(store, /\.eq\("upload_claim_id", existing\.upload_claim_id\)[\s\S]*\.lt\("upload_claim_expires_at"/);
assert.doesNotMatch(store, /\.or\(`/);
assert.match(route, /code: "handoff_expired"/);
assert.match(route, /code: "handoff_completed"/);
assert.match(route, /code: "handoff_busy"/);

console.log("fresh mobile handoff upload regression passed");
