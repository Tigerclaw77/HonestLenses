import assert from "node:assert/strict";
import { reorderRequestFeedback } from "./requestFeedback";

// Known and unknown customers receive the same successful response shape.
assert.deepEqual(reorderRequestFeedback(200, null), { state: "sent", retrySeconds: 60 });
assert.deepEqual(reorderRequestFeedback(429, "120"), { state: "rate-limited", retrySeconds: 120 });
assert.deepEqual(reorderRequestFeedback(503, null), { state: "failed", retrySeconds: 0 });
assert.deepEqual(reorderRequestFeedback(500, null), { state: "failed", retrySeconds: 0 });
console.log("Reorder request feedback passed.");
